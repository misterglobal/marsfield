"use client";

import type { ReactNode } from "react";

interface StudioV2FailureProbeProps {
  children: ReactNode;
  enabled: boolean;
}

export function StudioV2FailureProbe({ children, enabled }: StudioV2FailureProbeProps) {
  if (enabled) throw new Error("Simulated Studio V2 render failure");

  return children;
}
