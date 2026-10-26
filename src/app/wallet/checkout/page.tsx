import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutFromUrl } from "@/components/credits";

export const metadata: Metadata = { title: "Checkout · SimuBox" };

export default function CheckoutPage() {
  // The order id is in the query string, read in the browser.
  return (
    <Suspense fallback={null}>
      <CheckoutFromUrl />
    </Suspense>
  );
}
