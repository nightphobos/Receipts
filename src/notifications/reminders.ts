/**
 * Local reveal reminders over expo-notifications (no server, no push token). Pure scheduling
 * logic lives in core/reminders.ts. Demo mode never touches the OS scheduler.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";
import * as Notifications from "expo-notifications";

import {
  REMINDER_CHANNEL_ID,
  REMINDER_CHANNEL_NAME,
  isReminderId,
  reconcileReminders,
  reminderId,
  remindersForCall,
  remindersFromReceipts,
  type Reminder,
  type ScheduledReminder,
} from "../core/reminders";
import type { ReceiptV2 } from "../core/score";
import { appNowSec, isDemoActive } from "../demo/store";

const ASKED_KEY = "rcpt:reminders-asked";

export interface ReminderData {
  rcptReminder: true;
  hash: string;
  signature: string;
  at: number;
  body: string;
}

let configured = false;

/** Foreground display + Android channel. Safe to call repeatedly. */
export async function configureReminders(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: REMINDER_CHANNEL_NAME,
      importance: Notifications.AndroidImportance.HIGH,
    });
}

async function granted(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/**
 * On the first seal: short explainer, then the OS prompt. Denial is fine (the app works the same,
 * the user just has to remember). Never asks twice; afterwards only reports the current state.
 */
export async function ensureReminderPermission(): Promise<boolean> {
  if (await granted()) return true;
  if ((await AsyncStorage.getItem(ASKED_KEY)) === "1") return false;
  await AsyncStorage.setItem(ASKED_KEY, "1");
  const wants = await new Promise<boolean>((resolve) =>
    Alert.alert(
      "Remind you to reveal?",
      "An unrevealed call counts as a miss. Receipts can send a local reminder when your call is ready to reveal and 4 h before the window closes. Nothing leaves your phone; the reminder never shows your direction.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Remind me", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
  if (!wants) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function schedule(r: Reminder): Promise<void> {
  const data: ReminderData = { rcptReminder: true, hash: r.hash, signature: r.signature, at: r.at, body: r.body };
  await Notifications.scheduleNotificationAsync({
    identifier: r.id,
    content: { title: r.title, body: r.body, data: data as unknown as Record<string, unknown> },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at * 1000, channelId: REMINDER_CHANNEL_ID },
  });
}

/** After a successful seal (number = 1-based receipt number). Asks for permission the first time. */
export async function scheduleSealReminders(c: Parameters<typeof remindersForCall>[0]): Promise<void> {
  if (isDemoActive()) return;
  try {
    await configureReminders();
    if (!(await ensureReminderPermission())) return;
    const now = appNowSec();
    for (const r of remindersForCall(c)) if (r.at > now) await schedule(r);
  } catch (e) {
    console.warn("Scheduling reveal reminders failed", e);
  }
}

/** After a reveal. */
export async function cancelRevealReminders(hash: string): Promise<void> {
  if (isDemoActive()) return;
  try {
    await Promise.all(
      (["due", "last"] as const).map((k) => Notifications.cancelScheduledNotificationAsync(reminderId(hash, k))),
    );
  } catch (e) {
    console.warn("Cancelling reveal reminders failed", e);
  }
}

function asScheduled(n: Notifications.NotificationRequest): ScheduledReminder {
  const d = n.content.data as Partial<ReminderData> | undefined;
  return {
    id: n.identifier,
    hash: typeof d?.hash === "string" ? d.hash : undefined,
    at: typeof d?.at === "number" ? d.at : undefined,
    body: typeof d?.body === "string" ? d.body : undefined,
  };
}

/** Bring the OS schedule in line with chain history. Never prompts; no-op without permission. */
export async function reconcileRevealReminders(receipts: readonly ReceiptV2[]): Promise<void> {
  if (isDemoActive()) return;
  try {
    await configureReminders();
    if (!(await granted())) return;
    const now = appNowSec();
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).map(asScheduled);
    const plan = reconcileReminders(remindersFromReceipts(receipts, now), scheduled, {
      knownHashes: receipts.map((r) => r.hash),
      nowSec: now,
    });
    await Promise.all(plan.cancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    for (const r of plan.schedule) await schedule(r);
  } catch (e) {
    console.warn("Reconciling reveal reminders failed", e);
  }
}

/** Receipt to open for a tapped notification, or null if it isn't one of ours. */
export function receiptForResponse(
  res: Notifications.NotificationResponse | null | undefined,
): { hash: string; signature: string } | null {
  if (!res || !isReminderId(res.notification.request.identifier)) return null;
  const d = res.notification.request.content.data as Partial<ReminderData> | undefined;
  if (typeof d?.hash !== "string" || typeof d.signature !== "string") return null;
  return { hash: d.hash, signature: d.signature };
}
