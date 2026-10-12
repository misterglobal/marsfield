import type { Metadata } from "next";
import { StudioShell } from "@/features/studio-v2/StudioShell";
import { StudioV2FailureProbe } from "./StudioV2FailureProbe";

export const metadata: Metadata = {
  title: "Studio V2 Preview | Marsfield",
  robots: { index: false, follow: false },
};

interface StudioV2PageProps {
  searchParams: Promise<{ simulateFailure?: string }>;
}

export default async function StudioV2Page({ searchParams }: StudioV2PageProps) {
  const { simulateFailure } = await searchParams;

  const shouldSimulateFailure =
    process.env.STUDIO_V2_FAILURE_TEST === "enabled" && simulateFailure === "1";

  return <StudioV2FailureProbe enabled={shouldSimulateFailure}><StudioShell /></StudioV2FailureProbe>;
}
