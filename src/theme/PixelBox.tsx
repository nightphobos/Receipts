import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { pixel } from "./tokens";

export type PixelBoxProps = {
  fill: string;
  borderColor: string;
  /** Hard drop-shadow colour; omit for none. */
  shadowColor?: string;
  shadow?: number;
  cut?: number;
  border?: number;
  /** Lift the box by the shadow height (pressed state: box moves down, shadow hidden). */
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/** Notched rectangle: two overlapping fills (one inset horizontally, one vertically) cut the corners square. */
function Notched({ fill, borderColor, cut, border, offset }: { fill: string; borderColor: string; cut: number; border: number; offset: number }) {
  return (
    <>
      <View
        style={[
          StyleSheet.absoluteFill,
          { top: cut + offset, bottom: cut - offset, backgroundColor: fill, borderLeftWidth: border, borderRightWidth: border, borderColor },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { top: offset, bottom: -offset, left: cut, right: cut, backgroundColor: fill, borderTopWidth: border, borderBottomWidth: border, borderColor },
        ]}
      />
    </>
  );
}

/** Pixel-art box: cut corners, 2px border, hard shadow with no blur. Base of PixelButton and Chip. */
export function PixelBox({
  fill,
  borderColor,
  shadowColor,
  shadow = pixel.shadow,
  cut = pixel.cut,
  border = pixel.border,
  pressed = false,
  style,
  contentStyle,
  children,
}: PixelBoxProps) {
  const drop = shadowColor ? shadow : 0;
  const offset = pressed ? drop : 0;
  return (
    <View style={[{ marginBottom: drop }, style]}>
      {shadowColor && !pressed ? (
        <Notched fill={shadowColor} borderColor={shadowColor} cut={cut} border={border} offset={drop} />
      ) : null}
      <Notched fill={fill} borderColor={borderColor} cut={cut} border={border} offset={offset} />
      <View style={[{ padding: border, transform: [{ translateY: offset }] }, contentStyle]}>{children}</View>
    </View>
  );
}
