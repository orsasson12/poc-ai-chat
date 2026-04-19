import { env, hasAxiom } from "@/lib/env";

const INGEST_URL = "https://api.axiom.co/v1/datasets";

type AxiomRecord = Record<string, unknown> & { _time?: string };

let buffer: AxiomRecord[] = [];
let flushScheduled = false;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_THRESHOLD = 20;

async function flushNow(): Promise<void> {
  if (!hasAxiom() || buffer.length === 0) {
    buffer = [];
    return;
  }
  const batch = buffer;
  buffer = [];
  try {
    await fetch(`${INGEST_URL}/${encodeURIComponent(env.axiomDataset)}/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.axiomToken}`,
        "Content-Type": "application/x-ndjson",
      },
      body: batch.map((r) => JSON.stringify(r)).join("\n"),
      keepalive: true,
    });
  } catch {
    // Telemetry must never throw. Drop the batch on failure.
  }
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(() => {
    flushScheduled = false;
    void flushNow();
  }, FLUSH_INTERVAL_MS);
}

export function sendAxiom(record: AxiomRecord): void {
  if (!hasAxiom()) return;
  try {
    buffer.push({ _time: new Date().toISOString(), ...record });
    if (buffer.length >= FLUSH_THRESHOLD) {
      void flushNow();
    } else {
      scheduleFlush();
    }
  } catch {
    // Never throw from telemetry.
  }
}

export async function flushAxiom(): Promise<void> {
  await flushNow();
}
