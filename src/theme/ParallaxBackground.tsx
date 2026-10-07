import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { AppState, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import { DeviceMotion } from "expo-sensors";

import { layerOffset, lowPass, normalizeTilt, skylineTile, starTile } from "../core/parallax";
import { colors } from "./tokens";

/** dp per art pixel: offsets and art both sit on this grid so nothing blurs. */
const GRID = 3;
/** Extra art below/above each layer so tilt and scroll never reveal an edge. */
const PAD = 84;
/** Scroll beyond this no longer moves the layers (near layer moves ≤ 60 dp). */
const MAX_SCROLL = 120;
const SENSOR_INTERVAL_MS = 33;
/** Tilt smoothing per sample, and the much slower drift of the "resting" front/back angle. */
const TILT_ALPHA = 0.15;
const REST_ALPHA = 0.01;

const ScrollContext = createContext<SharedValue<number> | null>(null);

/**
 * Feeds a screen's list scroll into the parallax. Spread the result onto a ScrollView/FlatList;
 * the offset resets when the screen gains focus.
 */
export function useParallaxScroll() {
  const scroll = useContext(ScrollContext);
  useFocusEffect(
    useCallback(() => {
      if (scroll) scroll.value = 0;
    }, [scroll]),
  );
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (scroll) scroll.value = Math.min(MAX_SCROLL, e.nativeEvent.contentOffset.y);
    },
    [scroll],
  );
  return { onScroll, scrollEventThrottle: 16 };
}

/** Wraps the app: three pixel layers (stars, far city, near city) behind `children`. */
export function ParallaxBackground({ children }: { children: React.ReactNode }) {
  const scroll = useSharedValue(0);
  return (
    <ScrollContext.Provider value={scroll}>
      <View style={styles.root}>
        <ParallaxLayers scroll={scroll} />
        {children}
      </View>
    </ScrollContext.Provider>
  );
}

function ParallaxLayers({ scroll }: { scroll: SharedValue<number> }) {
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const t = useSharedValue(0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    t.value = info.timeSinceFirstFrame / 1000;
  }, false);

  // Drift + ~30 Hz tilt only while the app is in the foreground and motion is allowed.
  useEffect(() => {
    if (still) return;
    let sub: { remove(): void } | null = null;
    let restBeta: number | null = null;
    let fx = 0;
    let fy = 0;
    let cancelled = false;

    const start = async () => {
      frame.setActive(true);
      if (sub || !(await DeviceMotion.isAvailableAsync().catch(() => false)) || cancelled) return;
      DeviceMotion.setUpdateInterval(SENSOR_INTERVAL_MS);
      sub = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        restBeta = restBeta === null ? rotation.beta : lowPass(restBeta, rotation.beta, REST_ALPHA);
        const n = normalizeTilt(rotation.gamma, rotation.beta, restBeta);
        fx = lowPass(fx, n.x, TILT_ALPHA);
        fy = lowPass(fy, n.y, TILT_ALPHA);
        tiltX.value = fx;
        tiltY.value = fy;
      });
    };
    const stop = () => {
      frame.setActive(false);
      sub?.remove();
      sub = null;
    };

    if (AppState.currentState === "active") start();
    const appSub = AppState.addEventListener("change", (s) => (s === "active" ? start() : stop()));
    return () => {
      cancelled = true;
      appSub.remove();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  const artW = Math.ceil(width / GRID);
  const tileW = artW * GRID;
  const skyH = Math.ceil((height + 2 * PAD) / GRID);
  const farH = Math.ceil(height * 0.28 / GRID);
  const nearH = Math.ceil(height * 0.18 / GRID);
  const padArt = Math.ceil(PAD / GRID);

  const art = useMemo(
    () => ({
      stars: starTile(artW, skyH, 11),
      far: skylineTile(artW, farH, 23, 6, false),
      near: skylineTile(artW, nearH, 37, 5, true),
    }),
    [artW, skyH, farH, nearH],
  );

  const s = { t, tiltX, tiltY, scroll, tileW, still };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Layer depth={0} {...s} style={{ top: -PAD, height: skyH * GRID }}>
        <ArtSvg artW={artW} artH={skyH}>
          {[0, artW].flatMap((ox) =>
            art.stars.map((p, i) => (
              <Rect
                key={`${ox}-${i}`}
                x={ox + p.x}
                y={p.y}
                width={1}
                height={1}
                fill={p.grid === 0 ? colors.text : colors.border}
              />
            )),
          )}
        </ArtSvg>
      </Layer>
      <Layer depth={1} {...s} style={{ bottom: -PAD, height: (farH + padArt) * GRID }}>
        <City artW={artW} cityH={farH} padArt={padArt} tile={art.far} fill={colors.cityFar} />
      </Layer>
      <Layer depth={2} {...s} style={{ bottom: -PAD, height: (nearH + padArt) * GRID }}>
        <City artW={artW} cityH={nearH} padArt={padArt} tile={art.near} fill={colors.cityNear} />
      </Layer>
    </View>
  );
}

type LayerProps = {
  depth: number;
  t: SharedValue<number>;
  tiltX: SharedValue<number>;
  tiltY: SharedValue<number>;
  scroll: SharedValue<number>;
  tileW: number;
  still: boolean;
  style: { top?: number; bottom?: number; height: number };
  children: React.ReactNode;
};

function Layer({ depth, t, tiltX, tiltY, scroll, tileW, still, style, children }: LayerProps) {
  const animated = useAnimatedStyle(() => {
    const o = layerOffset({
      depth,
      t: t.value,
      tiltX: tiltX.value,
      tiltY: tiltY.value,
      scroll: scroll.value,
      tileWidth: tileW,
      grid: GRID,
      still,
    });
    return { transform: [{ translateX: o.x }, { translateY: o.y }] };
  });
  return <Animated.View style={[styles.layer, { width: tileW * 2 }, style, animated]}>{children}</Animated.View>;
}

/** SVG in art-pixel units, two tiles wide, scaled by GRID. */
function ArtSvg({ artW, artH, children }: { artW: number; artH: number; children: React.ReactNode }) {
  return (
    <Svg width={artW * 2 * GRID} height={artH * GRID} viewBox={`0 0 ${artW * 2} ${artH}`}>
      {children}
    </Svg>
  );
}

function City({
  artW,
  cityH,
  padArt,
  tile,
  fill,
}: {
  artW: number;
  cityH: number;
  padArt: number;
  tile: ReturnType<typeof skylineTile>;
  fill: string;
}) {
  return (
    <ArtSvg artW={artW} artH={cityH + padArt}>
      <Rect x={0} y={cityH} width={artW * 2} height={padArt} fill={fill} />
      {[0, artW].flatMap((ox) => [
        ...tile.buildings.map((b, i) => (
          <Rect key={`b${ox}-${i}`} x={ox + b.x} y={cityH - b.h} width={b.w} height={b.h} fill={fill} />
        )),
        ...tile.windows.map((w, i) => (
          <Rect key={`w${ox}-${i}`} x={ox + w.x} y={w.y} width={1} height={1} fill={colors.windows[w.color]} />
        )),
      ])}
    </ArtSvg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  layer: { position: "absolute", left: 0 },
});
