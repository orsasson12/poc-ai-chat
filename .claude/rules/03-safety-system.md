# Safety System — Five Layers

Layers operate sequentially. Blocked at layer 1 = never reaches layer 2. All five must pass before showing response to end customer.

## Layer 1 — Input Injection Classifier (sync, <1ms)
- 20+ regex patterns: instruction overrides, system prompt extraction, persona jailbreaks, delimiter manipulation, encoding attacks, social engineering
- Decodes obfuscation before matching: base64, character-spacing normalization
- Heuristic scoring for ambiguous inputs (threshold: 0.80)
- All blocked inputs return same safe fallback (no info leakage)

## Layer 2 — Content Moderation (async, ~100ms)
- OpenAI Moderation API
- Category-specific responses:
  - Abusive/hate/harassment → professional de-escalation
  - Self-harm → crisis resources
  - Sexual/violence → neutral refusal

## Layer 3 — PII Detection & Stripping (sync, <1ms)
- Regex patterns: email, phone, credit card, SSN, IP
- Replace with [EMAIL], [PHONE] etc. before LLM
- Original retained in conversation log for business owner

## Layer 4 — Output Validation (sync, <1ms, post-generation)
- Canary token presence check
- System prompt phrase pattern scan
- Response length > 3000 chars = hallucination signal
- Groundedness check: empty chunks + non-fallback = violation
- Failed = replace with fallback, log scope_violation

## Layer 5 — Monitoring & Audit (async)
- All security events → security_events table
- Fields: event_type, severity, input_text (500 chars), classification_score, blocked, conversation_id
- Dashboard Security panel for business owners
- Axiom alerts when event rate spikes

## Canary Tokens
- Unique per tenant: HMAC(tenantId + salt)
- Injected into system prompt
- Output validation scans every response
- Detection → replace with fallback + log canary_leak event
