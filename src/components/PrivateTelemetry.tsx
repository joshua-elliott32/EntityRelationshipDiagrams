"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { withoutQueryOrFragment } from "@/lib/telemetry";

/**
 * Vercel Web Analytics (page views) and Speed Insights (load timings) with
 * every address trimmed to its path, so share links (`#d=…`) never reach
 * Vercel. What is collected is described in the About & privacy dialog
 * (src/components/toolbar/MoreMenu.tsx) — keep the two in step.
 */
export function PrivateTelemetry() {
  return (
    <>
      <Analytics beforeSend={withoutQueryOrFragment} />
      <SpeedInsights beforeSend={withoutQueryOrFragment} />
    </>
  );
}
