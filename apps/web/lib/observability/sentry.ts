import { hasSentry } from "@/lib/env";

type SentryModule = typeof import("@sentry/nextjs");
let cached: SentryModule | null = null;
let loadAttempted = false;

function getSentry(): SentryModule | null {
  if (!hasSentry()) return null;
  if (cached) return cached;
  if (loadAttempted) return null;
  loadAttempted = true;
  try {
    // Synchronous require — Sentry's Next SDK is already loaded by instrumentation.ts
    // by the time logger calls this, so the module is in the require cache.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@sentry/nextjs") as SentryModule;
    return cached;
  } catch {
    return null;
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  try {
    const sentry = getSentry();
    if (!sentry) return;
    sentry.captureException(err, { extra: context });
  } catch {
    // Telemetry never throws.
  }
}

export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  try {
    const sentry = getSentry();
    if (!sentry) return;
    sentry.addBreadcrumb({ message, data, level: "info" });
  } catch {
    // Telemetry never throws.
  }
}
