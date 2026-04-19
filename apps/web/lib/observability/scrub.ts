const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/g;
const BEARER_RE = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/\-=]+/gi;
const PHONE_RE = /\b(?:\+?\d{1,3}[ .-]?)?\(?\d{2,4}\)?[ .-]?\d{3,4}[ .-]?\d{3,4}\b/g;
const SECRET_KEY_RE = /\b(?:sk|rk|pk)[-_][A-Za-z0-9]{20,}\b/g;

const PII_SENSITIVE_KEYS = /^(message|content|prompt|input|body|stack|query|answer|response|text)$/i;

export function scrubString(value: string): string {
  return value
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(CARD_RE, "[CARD]")
    .replace(BEARER_RE, "[TOKEN]")
    .replace(SECRET_KEY_RE, "[KEY]")
    .replace(PHONE_RE, "[PHONE]");
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[DEPTH]";
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PII_SENSITIVE_KEYS.test(k) && typeof v === "string") {
        out[k] = `[scrubbed:${v.length} chars]`;
      } else {
        out[k] = scrubValue(v, depth + 1);
      }
    }
    return out;
  }
  return "[UNSERIALIZABLE]";
}

export function serializeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: scrubString(err.message),
      stack: err.stack ? scrubString(err.stack) : undefined,
    };
  }
  return { name: "UnknownError", message: scrubString(String(err)) };
}

export function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("rate limit") || msg.includes("429")) return "rate_limit";
  if (msg.includes("timeout") || msg.includes("etimedout")) return "timeout";
  if (msg.includes("econnrefused") || msg.includes("network")) return "network";
  if (msg.includes("unauthorized") || msg.includes("401")) return "auth";
  if (msg.includes("not found") || msg.includes("404")) return "not_found";
  if (msg.includes("quota") || msg.includes("billing")) return "quota";
  if (msg.includes("pinecone")) return "pinecone_error";
  if (msg.includes("openai")) return "openai_error";
  if (msg.includes("anthropic") || msg.includes("claude")) return "anthropic_error";
  return "unknown";
}
