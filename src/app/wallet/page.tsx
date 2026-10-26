import type { Metadata } from "next";
import { CreditsStore } from "@/components/credits";

export const metadata: Metadata = { title: "Credits · SimuBox" };

export default function WalletPage() {
  return <CreditsStore />;
}
