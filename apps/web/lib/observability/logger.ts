import { hasAxiom, hasSentry } from "@/lib/env";
import { sendAxiom } from "./axiom";
import { addBreadcrumb, captureException } from "./sentry";
import { classifyError, scrubValue, serializeError } from "./scrub";
import type { EventFields, EventName } from "./schema";

export type LogContext = {
  tenantId?: string | null;
  conversationId?: string | null;
  assistantId?: string | null;
  sessionId?: string | null;
  stage?: string;
  [k: string]: unknown;
};

export interface Logger {
  error(err: unknown, ctx?: LogContext): void;
  event<N extends EventName>(name: N, fields: EventFields[N]): void;
  breadcrumb(msg: string, data?: Record<string, unknown>): void;
  withContext(ctx: LogContext): Logger;
}

let reentryFlag = false;

function safe<T>(fn: () => T): T | undefined {
  if (reentryFlag) return undefined;
  reentryFlag = true;
  try {
    return fn();
  } catch {
    return undefined;
  } finally {
    reentryFlag = false;
  }
}

function createLogger(baseCtx: LogContext = {}): Logger {
  return {
    error(err, ctx) {
      safe(() => {
        const merged = { ...baseCtx, ...ctx };
        const scrubbed = (scrubValue(merged) ?? {}) as Record<string, unknown>;
        const serialized = serializeError(err);
        const errKind = classifyError(err);

        if (hasSentry()) {
          captureException(err, { ...scrubbed, errKind });
        }

        if (hasAxiom()) {
          sendAxiom({
            _kind: "error",
            level: "error",
            errKind,
            err: serialized,
            ...scrubbed,
          });
        }

        if (!hasSentry() && !hasAxiom()) {
          console.error("[logger]", serialized.message, scrubbed);
        }
      });
    },

    event(name, fields) {
      safe(() => {
        const merged = { ...baseCtx, ...fields };
        const scrubbed = (scrubValue(merged) ?? {}) as Record<string, unknown>;

        if (hasAxiom()) {
          sendAxiom({ _kind: "event", event: name, ...scrubbed });
        }

        if (!hasAxiom() && process.env.NODE_ENV !== "production") {
          console.info(`[event] ${name}`, scrubbed);
        }
      });
    },

    breadcrumb(msg, data) {
      safe(() => {
        if (hasSentry()) {
          addBreadcrumb(msg, data);
        }
      });
    },

    withContext(ctx) {
      return createLogger({ ...baseCtx, ...ctx });
    },
  };
}

export const logger: Logger = createLogger();
