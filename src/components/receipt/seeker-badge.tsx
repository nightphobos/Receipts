import React from "react";

import { Badge, colors } from "../../theme";

/** Shown in Profile when the connected wallet holds a Seeker Genesis Token. */
export function SeekerBadge() {
  return <Badge label="SEEKER VERIFIED" color={colors.sealed} />;
}
