import React from "react";

import { Badge, colors } from "../../theme";

/** Shown in Profile when the connected wallet holds a Seeker Genesis Token. */
export function SeekerBadge() {
  return <Badge label="SEEKER VERIFIED" color={colors.sealed} />;
}

/** Shown on profiles when the wallet holds at least SKR_GATE_MIN SKR. */
export function SkrHolderBadge() {
  return <Badge label="SKR HOLDER" color={colors.accent} />;
}
