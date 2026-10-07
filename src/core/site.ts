/**
 * Minimal static pages for the indexer's GitHub Pages site (site/index.html, site/u/<wallet>.html).
 * Pure TS: no RN/Expo imports. The JSON files next to them are the data; these are for share links.
 */
import { formatChangePct, formatZ } from "./ceremony";
import { formatUsd, solscanTxUrl } from "./format";
import type { Leaderboard, LeaderboardRow, ProfileReceipt, WalletProfile } from "./leaderboard";
import type { StatusV2 } from "./score";
import { formatHitRate, formatUtcDayTime } from "./share";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `body{background:#14122B;color:#F4EEDC;font-family:ui-monospace,Menlo,monospace;margin:0 auto;max-width:860px;padding:16px}
a{color:#FFD23F}h1,h2{color:#FFD23F}table{border-collapse:collapse;width:100%}
th,td{border-bottom:1px solid #4A4580;padding:6px 8px;text-align:left}th{color:#B9B2D6}
.muted{color:#B9B2D6}.hit{color:#5BE37D}.miss,.forfeited,.overlap{color:#FF5C7A}`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body>
${body}
<p class="muted">Receipts: sealed crypto price calls on Solana. Computed from public chain data by a re-runnable indexer; the chain is the source of truth.</p>
</body></html>
`;
}

const short = (w: string) => (w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);

function table(rows: readonly LeaderboardRow[], empty: string): string {
  if (rows.length === 0) return `<p class="muted">${escapeHtml(empty)}</p>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.rank}</td><td><a href="u/${escapeHtml(r.wallet)}.html">${escapeHtml(short(r.wallet))}</a></td>` +
        `<td>${formatZ(r.z)}</td><td>${r.hits}/${r.n}</td><td>${formatHitRate(r.hitRate)}</td>` +
        `<td>${r.forfeited}</td><td>${r.streak}</td></tr>`,
    )
    .join("\n");
  return `<table><tr><th>#</th><th>Wallet</th><th>z</th><th>Hits/N</th><th>Hit-rate</th><th>Forfeited</th><th>Streak</th></tr>
${body}</table>`;
}

export function renderLeaderboardHtml(lb: Leaderboard): string {
  return page(
    "Receipts — leaderboard",
    `<h1>🧾 Receipts leaderboard</h1>
<p class="muted">Updated ${escapeHtml(formatUtcDayTime(lb.generatedAt))} · ${lb.wallets} wallets · <a href="leaderboard.json">leaderboard.json</a></p>
<h2>Overall (≥ 24h calls)</h2>
<p class="muted">z = (hits − misses) / √N vs a coin flip. Eligible: N ≥ 10, commits on ≥ 3 UTC days, Seeker Genesis Token.</p>
${table(lb.overall, "No eligible wallets yet.")}
<h2>SKR Daily</h2>
${table(lb.skrDaily, "No SKR Daily calls scored yet.")}`,
  );
}

const STAMP: Record<StatusV2, string> = {
  sealed: "SEALED",
  awaiting_reveal: "AWAITING REVEAL",
  unresolved: "UNRESOLVED",
  forfeited: "FORFEITED",
  overlap: "OVERLAP",
  legacy: "LEGACY",
  hit: "HIT",
  miss: "MISS",
  void: "VOID",
};

function receiptRow(r: ProfileReceipt): string {
  const call = `${r.asset} ${r.dir === "up" ? "▲" : r.dir === "down" ? "▼" : "██████"} ${r.skrDaily ? "SKR Daily" : r.horizon}`;
  const prices =
    r.p0 == null ? "—" : r.pt == null ? `$${formatUsd(r.p0)}` : `$${formatUsd(r.p0)} → $${formatUsd(r.pt)} (${formatChangePct(r.p0, r.pt)})`;
  const links = [`<a href="${escapeHtml(solscanTxUrl(r.commitSignature))}">commit</a>`];
  if (r.revealSignature) links.push(`<a href="${escapeHtml(solscanTxUrl(r.revealSignature))}">reveal</a>`);
  return (
    `<tr><td>${escapeHtml(formatUtcDayTime(r.commitBlockTime))}</td><td>${escapeHtml(call)}</td>` +
    `<td>${escapeHtml(formatUtcDayTime(r.deadline))}</td><td>${escapeHtml(prices)}</td>` +
    `<td class="${r.status}">${STAMP[r.status]}</td><td>${links.join(" ")}</td></tr>`
  );
}

export function renderProfileHtml(p: WalletProfile): string {
  const s = p.stats;
  const e = p.eligibility;
  return page(
    `Receipts — ${p.wallet}`,
    `<p><a href="../index.html">← leaderboard</a></p>
<h1>🧾 ${escapeHtml(p.wallet)}</h1>
<p><b>${formatZ(s.z)} vs coin flip</b> · N ${s.n} · hit-rate ${formatHitRate(s.hitRate)} · ${s.hits} hits · ${s.misses} misses</p>
<p class="muted">hidden &amp; forfeited: ${s.forfeited} · overlaps: ${s.overlaps} · void: ${s.voids} · pending: ${s.pending} · streak: ${p.streak}</p>
<p class="muted">Leaderboard: ${e.eligible ? "eligible" : "not eligible"} (N ${e.n}/10, days ${e.days}/3, Seeker Genesis ${p.hasGenesis ? "yes" : "no"}) · <a href="${escapeHtml(p.wallet)}.json">json</a></p>
<table><tr><th>Sealed</th><th>Call</th><th>Deadline</th><th>P0 → PT</th><th>Result</th><th>Verify</th></tr>
${p.receipts.map(receiptRow).join("\n")}</table>`,
  );
}
