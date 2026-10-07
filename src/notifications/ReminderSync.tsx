/** Keeps reveal reminders in sync with chain history and opens the receipt when one is tapped. */
import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";

import { useReceiptsV2 } from "../hooks/useReceipts";
import { useDemo } from "../demo/store";
import { useAuthorization } from "../utils/useAuthorization";
import { navigationRef } from "../navigators/AppNavigator";
import { receiptForResponse, reconcileRevealReminders } from "./reminders";

function ReminderReconcile() {
  const { selectedAccount } = useAuthorization();
  const receipts = useReceiptsV2(selectedAccount?.publicKey);
  const data = receipts.data;
  useEffect(() => {
    if (data) reconcileRevealReminders(data.map((row) => row.receipt));
  }, [data]);
  return null;
}

function ReminderTaps() {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const target = receiptForResponse(last);
    if (!target || !last) return;
    const key = `${last.notification.request.identifier}:${last.notification.date}`;
    if (handled.current === key) return;
    const open = () => {
      if (!navigationRef.isReady()) return false;
      handled.current = key;
      navigationRef.navigate("ReceiptDetail", target);
      return true;
    };
    if (open()) return;
    // Cold start from a tap: wait for the navigator to mount.
    const id = setInterval(() => open() && clearInterval(id), 200);
    return () => clearInterval(id);
  }, [last]);
  return null;
}

export function ReminderSync() {
  const { active } = useDemo();
  return (
    <>
      <ReminderTaps />
      {!active && <ReminderReconcile />}
    </>
  );
}
