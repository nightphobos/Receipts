/**
 * T030 devnet spike: can one tx carry [memo, 0-lamport transfer signer→REGISTRY]
 * and does getSignaturesForAddress(REGISTRY) list it? Also checks that ed25519
 * signatures of the master message are deterministic.
 *
 * Run: npx tsx scripts/spike-registry.ts   (DEVNET ONLY — never mainnet)
 */
import * as fs from "fs";
import * as path from "path";
import { ed25519 } from "@noble/curves/ed25519";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC = "https://api.devnet.solana.com";
const REGISTRY = new PublicKey("E5YRG7uSptKAd2T4WbMyK8xadyuZ8v132Ji6XhAxX5SJ");
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const MASTER_MESSAGE =
  "Receipts master key v1\nSigning this lets Receipts hide and later reveal your call directions. It cannot move funds.";
const KEY_DIR = path.join(__dirname, "..", ".devnet");
const KEY_FILE = path.join(KEY_DIR, "spike-keypair.json");

function loadOrCreateKeypair(): Keypair {
  if (fs.existsSync(KEY_FILE)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEY_FILE, "utf8"))));
  }
  fs.mkdirSync(KEY_DIR, { recursive: true });
  const kp = Keypair.generate();
  fs.writeFileSync(KEY_FILE, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

function checkDeterministicSignatures(kp: Keypair): boolean {
  const msg = new TextEncoder().encode(MASTER_MESSAGE);
  const seed = kp.secretKey.slice(0, 32);
  const a = ed25519.sign(msg, seed);
  const b = ed25519.sign(msg, seed);
  const same = Buffer.from(a).equals(Buffer.from(b));
  const valid = ed25519.verify(a, msg, kp.publicKey.toBytes());
  console.log(`ed25519 master signature deterministic=${same} valid=${valid}`);
  return same && valid;
}

async function ensureFunds(conn: Connection, pk: PublicKey): Promise<void> {
  const bal = await conn.getBalance(pk, "confirmed");
  console.log(`balance ${bal / LAMPORTS_PER_SOL} SOL`);
  if (bal >= 0.05 * LAMPORTS_PER_SOL) return;
  const sig = await conn.requestAirdrop(pk, LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  console.log(`airdrop ok ${sig}`);
}

async function sendTagged(conn: Connection, kp: Keypair, memo: string): Promise<string> {
  const tx = new Transaction().add(
    new TransactionInstruction({
      keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf8"),
    }),
    SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: REGISTRY, lamports: 0 }),
  );
  return sendAndConfirmTransaction(conn, tx, [kp], { commitment: "confirmed" });
}

/**
 * Fallback when the faucet refuses: simulate the tagged tx (sigVerify off, nothing sent)
 * with a funded devnet account as signer, taken from a recent memo tx's fee payer.
 */
async function simulateWithFundedPayer(conn: Connection): Promise<void> {
  const sigs = await conn.getSignaturesForAddress(MEMO_PROGRAM_ID, { limit: 20 }, "confirmed");
  for (const s of sigs) {
    const tx = await conn.getParsedTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const payer = tx?.transaction.message.accountKeys[0]?.pubkey;
    if (!payer || (await conn.getBalance(payer, "confirmed")) < 0.01 * LAMPORTS_PER_SOL) continue;
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [
        new TransactionInstruction({
          keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from("rcpt:2:test", "utf8"),
        }),
        SystemProgram.transfer({ fromPubkey: payer, toPubkey: REGISTRY, lamports: 0 }),
      ],
    }).compileToLegacyMessage();
    const sim = await conn.simulateTransaction(new VersionedTransaction(message), {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    });
    console.log(`SIMULATION payer=${payer.toBase58()} lamports=0 err=${JSON.stringify(sim.value.err)}`);
    console.log(sim.value.logs?.join("\n"));
    return;
  }
  console.log("no funded devnet payer found for simulation");
}

async function main(): Promise<void> {
  const kp = loadOrCreateKeypair();
  console.log(`devnet key ${kp.publicKey.toBase58()}`);
  const deterministic = checkDeterministicSignatures(kp);

  const conn = new Connection(RPC, "confirmed");
  try {
    await ensureFunds(conn, kp.publicKey);
  } catch (e) {
    console.log(`airdrop failed: ${(e as Error).message}`);
    await simulateWithFundedPayer(conn);
    console.log(`RESULT deterministic=${deterministic} sent=false (simulation only) — rerun when the faucet allows`);
    process.exit(2);
  }

  const registryInfo = await conn.getAccountInfo(REGISTRY, "confirmed");
  console.log(`registry account exists=${registryInfo !== null} lamports=${registryInfo?.lamports ?? 0}`);

  let sig: string;
  let approach = "plain 0-lamport transfer";
  try {
    sig = await sendTagged(conn, kp, "rcpt:2:test");
  } catch (e) {
    console.log(`0-lamport transfer failed: ${(e as Error).message}`);
    approach = "0-lamport transfer after funding REGISTRY rent-exempt";
    const rent = await conn.getMinimumBalanceForRentExemption(0);
    const fund = await sendAndConfirmTransaction(
      conn,
      new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: REGISTRY, lamports: rent })),
      [kp],
      { commitment: "confirmed" },
    );
    console.log(`funded registry with ${rent} lamports: ${fund}`);
    sig = await sendTagged(conn, kp, "rcpt:2:test");
  }
  console.log(`tagged tx ok (${approach}): ${sig}`);

  const parsed = await conn.getParsedTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const keys = parsed?.transaction.message.accountKeys.map((k) => k.pubkey.toBase58()) ?? [];
  console.log(`tx err=${JSON.stringify(parsed?.meta?.err ?? null)} includesRegistry=${keys.includes(REGISTRY.toBase58())}`);

  let listed = false;
  for (let i = 0; i < 10 && !listed; i++) {
    const sigs = await conn.getSignaturesForAddress(REGISTRY, { limit: 20 }, "confirmed");
    const hit = sigs.find((s) => s.signature === sig);
    if (hit) {
      listed = true;
      console.log(`getSignaturesForAddress(REGISTRY) lists it; memo field=${JSON.stringify(hit.memo)}`);
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  if (!listed) console.log("getSignaturesForAddress(REGISTRY) did NOT list the tx");

  console.log(`RESULT deterministic=${deterministic} sent=true listed=${listed} approach="${approach}"`);
  if (!deterministic || !listed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
