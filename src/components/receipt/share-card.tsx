import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Pattern, Polygon, Rect } from "react-native-svg";

import { poseForStatus } from "../../core/mascot";
import { SHARE_CARD_DEMO_LINE, shareCardLayout, type ShareCardModel } from "../../core/shareCard";
import { Mascot, STAMP_META, colors, fonts } from "../../theme";

/** View width of the card; captured at 1080×1350 px (SHARE_CARD_WIDTH/HEIGHT). */
export const SHARE_CARD_VIEW_WIDTH = 360;

function zigzag(width: number, tw: number, th: number): string {
  const pts = ["0,0"];
  for (let x = 0; x < width; x += tw) pts.push(`${Math.min(x + tw / 2, width)},${th}`, `${Math.min(x + tw, width)},0`);
  return pts.join(" ");
}

function Dither({ width, height, color }: { width: number; height: number; color: string }) {
  const c = Math.max(2, Math.round(height / 8));
  return (
    <Svg width={width} height={height}>
      <Defs>
        <Pattern id="cardDither" width={2 * c} height={2 * c} patternUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={c} height={c} fill={color} />
          <Rect x={c} y={c} width={c} height={c} fill={color} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#cardDither)" />
    </Svg>
  );
}

/**
 * Off-screen 4:5 receipt card in the Night Register style, captured with view-shot.
 * Content comes only from `shareCardModel` (sealed cards have no direction).
 */
export const ShareCard = forwardRef<View, { model: ShareCardModel }>(function ShareCard({ model: m }, ref) {
  const L = shareCardLayout(SHARE_CARD_VIEW_WIDTH);
  const f = L.font;
  const stamp = m.outcome ? STAMP_META[m.outcome] : STAMP_META.sealed;
  const dirColor = m.dir === "▲" ? colors.stampHit : colors.stampMiss;
  const pose = m.outcome ? poseForStatus(m.outcome, { printing: false }) : "eat";
  const ink = { color: colors.ink };
  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.card, { width: L.width, height: L.height, padding: L.padding, gap: L.gap }]}
    >
      <View style={styles.header}>
        <Text style={[styles.wordmark, { fontSize: f.wordmark }]}>RECEIPTS</Text>
        <Mascot pose={pose} scale={L.mascotScale} />
      </View>

      <View style={{ width: L.paperWidth }}>
        <View style={[styles.paper, { padding: L.paperPadding, gap: L.gap }]}>
          <Text style={[styles.title, ink, { fontSize: f.title }]}>{`RECEIPT #${m.number}`}</Text>
          <View style={styles.dash} />
          <View style={styles.row}>
            <Text style={[styles.asset, ink, { fontSize: f.asset }]}>{`$${m.asset}`}</Text>
            {m.dir ? (
              <Text style={[styles.asset, { fontSize: f.asset, color: dirColor }]}>{m.dir}</Text>
            ) : (
              <Dither width={f.asset * 2.4} height={f.asset * 0.8} color={colors.sealed} />
            )}
          </View>
          <Text style={[styles.small, ink, { fontSize: f.small }]}>{m.when}</Text>
          <View style={styles.dash} />
          {m.p0 && (
            <View style={styles.row}>
              <Text style={[styles.label, ink, { fontSize: f.small }]}>P0</Text>
              <Text style={[styles.num, ink, { fontSize: f.price }]}>{m.p0}</Text>
            </View>
          )}
          {m.pt && (
            <View style={styles.row}>
              <Text style={[styles.label, ink, { fontSize: f.small }]}>PT</Text>
              <Text style={[styles.num, ink, { fontSize: f.price }]}>{m.pt}</Text>
            </View>
          )}
          {m.move && <Text style={[styles.num, styles.center, ink, { fontSize: f.move }]}>{m.move}</Text>}
          {m.kind === "sealed" && (
            <Text style={[styles.title, { fontSize: f.title, color: colors.sealedShadow }]}>Guess my side</Text>
          )}
          <View
            style={[
              styles.stamp,
              { borderColor: stamp.color, borderWidth: L.stampBorder },
              stamp.shape === "round" && styles.round,
              stamp.shape === "dashed" && styles.dashed,
            ]}
          >
            <Text style={[styles.stampText, { fontSize: f.stamp, color: stamp.color }]}>
              {stamp.mark ? `${stamp.mark} ${stamp.label}` : stamp.label}
            </Text>
          </View>
          <View style={styles.dash} />
          <Text style={[styles.small, styles.center, ink, { fontSize: f.small }]}>{m.record}</Text>
          <Text style={[styles.num, styles.center, ink, { fontSize: f.number }]}>{`tx ${m.tx}`}</Text>
          <Text style={[styles.small, styles.center, ink, { fontSize: f.small }]}>{m.verify}</Text>
        </View>
        <Svg width={L.paperWidth} height={L.toothH}>
          <Polygon points={zigzag(L.paperWidth, L.toothW, L.toothH)} fill={colors.paper} />
        </Svg>
      </View>

      {m.demo && <Text style={[styles.demoLine, { fontSize: f.small }]}>{SHARE_CARD_DEMO_LINE}</Text>}
      {m.demo && (
        <View style={[styles.ribbon, { top: L.padding * 1.1, right: -L.padding * 2.2, paddingVertical: L.gap / 2 }]}>
          <Text style={[styles.ribbonText, { fontSize: f.title }]}>DEMO</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch" },
  wordmark: { fontFamily: fonts.headingBold, color: colors.accent, letterSpacing: 3 },
  paper: { backgroundColor: colors.paper },
  title: { fontFamily: fonts.headingBold, textAlign: "center", letterSpacing: 2 },
  dash: { borderBottomWidth: 2, borderStyle: "dashed", borderColor: colors.ink, opacity: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  asset: { fontFamily: fonts.headingBold },
  label: { fontFamily: fonts.body },
  small: { fontFamily: fonts.body },
  num: { fontFamily: fonts.number },
  center: { textAlign: "center" },
  stamp: { alignSelf: "center", paddingHorizontal: 12, paddingVertical: 2, transform: [{ rotate: "-6deg" }] },
  round: { borderRadius: 999, paddingHorizontal: 20 },
  dashed: { borderStyle: "dashed" },
  stampText: { fontFamily: fonts.headingBold, letterSpacing: 1 },
  demoLine: { fontFamily: fonts.body, color: colors.accent, textAlign: "center" },
  ribbon: {
    position: "absolute",
    width: 160,
    alignItems: "center",
    backgroundColor: colors.accent,
    transform: [{ rotate: "45deg" }],
  },
  ribbonText: { fontFamily: fonts.headingBold, color: colors.bg, letterSpacing: 4 },
});
