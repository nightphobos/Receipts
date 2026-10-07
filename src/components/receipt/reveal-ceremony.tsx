import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ceremonyDuration, ceremonyFrame, formatChangePct } from "../../core/ceremony";
import { formatUsd } from "../../core/format";
import type { OutcomeV2 } from "../../core/score";
import { ReceiptDivider, ReceiptPaper, ReceiptRow, ReceiptTitle, StatusStamp, colors, space } from "../../theme";
import { ellipsify } from "../../utils/ellipsify";

const FRAME_MS = 50;

const HAPTIC: Record<OutcomeV2, Haptics.NotificationFeedbackType> = {
  hit: Haptics.NotificationFeedbackType.Success,
  miss: Haptics.NotificationFeedbackType.Error,
  void: Haptics.NotificationFeedbackType.Warning,
};

const fmtUtc = (sec: number) => `${new Date(sec * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export type RevealCeremonyProps = {
  outcome: OutcomeV2;
  p0: number;
  pt: number;
  commitSignature: string;
  sealedAt: number;
  /** Animate from the first line (just revealed / replay); otherwise show the printed receipt. */
  play: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Receipt paper printing tx hash, sealed time and P0, then the price ticking to PT and the
 * HIT/MISS/VOID stamp with a haptic. Reduce motion → final state, haptic only.
 */
export function RevealCeremony({ outcome, p0, pt, commitSignature, sealedAt, play, style }: RevealCeremonyProps) {
  const still = useReducedMotion();
  const animate = play && !still;
  const [elapsed, setElapsed] = useState(animate ? 0 : ceremonyDuration());
  const stamped = useRef(false);

  useEffect(() => {
    if (!animate) {
      setElapsed(ceremonyDuration());
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      const t = Date.now() - start;
      setElapsed(t);
      if (t >= ceremonyDuration()) clearInterval(id);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [animate]);

  const frame = ceremonyFrame(elapsed, { p0, pt });

  useEffect(() => {
    if (!play) return;
    if (!frame.stamp) {
      stamped.current = false;
      return;
    }
    if (stamped.current) return;
    stamped.current = true;
    Haptics.notificationAsync(HAPTIC[outcome]).catch(() => {});
  }, [play, frame.stamp, outcome]);

  const ptColor = outcome === "hit" ? colors.stampHit : outcome === "miss" ? colors.stampMiss : undefined;
  return (
    <ReceiptPaper style={style}>
      <ReceiptTitle>RECEIPT</ReceiptTitle>
      <ReceiptDivider />
      {frame.lines >= 1 && <ReceiptRow label="Tx" value={ellipsify(commitSignature, 6)} />}
      {frame.lines >= 2 && <ReceiptRow label="Sealed" value={fmtUtc(sealedAt)} />}
      {frame.lines >= 3 && <ReceiptRow label="P0" value={`$${formatUsd(p0)}`} />}
      {frame.price !== null && (
        <>
          <ReceiptDivider />
          <ReceiptRow
            label={frame.done ? `PT ${formatChangePct(p0, pt)}` : "PT"}
            value={`$${formatUsd(frame.price)}`}
            valueColor={frame.done ? ptColor : undefined}
          />
        </>
      )}
      <View style={styles.stampSlot}>{frame.stamp && <StatusStamp status={outcome} />}</View>
    </ReceiptPaper>
  );
}

const styles = StyleSheet.create({
  stampSlot: { minHeight: 40, alignItems: "center", justifyContent: "center", marginTop: space.sm },
});
