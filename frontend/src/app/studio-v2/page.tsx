import type { Metadata } from "next";
import { StudioShell } from "@/features/studio-v2/StudioShell";

export const metadata: Metadata = {
  title: "Studio V2 Preview | Marsfield",
  robots: { index: false, follow: false },
};

export default function StudioV2Page() {
  return <StudioShell />;
}
