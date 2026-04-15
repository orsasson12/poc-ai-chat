# Cookie and Browser Storage Audit

> **Not legal advice.** This document lists exactly what BizAssist stores in the end-customer's browser. Whether any of this requires cookie-banner consent on the host site depends on the jurisdiction and how the host site classifies it. Discuss with counsel.

Audit date: bundled with DPA version **1.0**. Must be re-verified whenever `public/widget.js` or `components/chat/chat-window.tsx` change storage calls.

## Summary

BizAssist does **not** set any HTTP cookies (`document.cookie`) in either the widget or the chat iframe. It uses **Web Storage** (`localStorage` by default, `sessionStorage` in cookie-free mode). Web Storage is origin-scoped to the BizAssist domain, not the host site, so it is separate from the host's first-party cookies.

## Widget (public/widget.js)

| Key | Storage | Value | Purpose |
|-----|---------|-------|---------|
| `ba_vid` | localStorage (or sessionStorage in cookieless mode) | Pseudonymous visitor ID, e.g. `v_abc123…` | Distinguish returning visitors for engagement rules. Not linked to any personally identifiable information unless the user voluntarily provides it. |
| `ba_return_{assistantId}` | same | Timestamp of last visit | Used by the `return_visitor` engagement trigger. |
| `ba_dismiss_{assistantId}` | same | Timestamp of dismissal | Suppresses the widget for 24 hours after the customer closes it, to avoid nagging. Auto-expires. |

**No third-party cookies**. **No fingerprinting**. **No analytics beacons** from the widget script itself.

## Chat iframe (components/chat/chat-window.tsx)

| Key | Storage | Value | Purpose |
|-----|---------|-------|---------|
| `bizassist_session_{assistantId}` | localStorage (or sessionStorage in cookieless mode) | Session ID, e.g. `sess_a1b2c3d4` | Associates messages with a conversation so history can be loaded on reload. |

## Cookie-free mode

When the tenant enables cookie-free mode (Compliance → Settings → Cookie-free mode), or when the host site sets `data-cookieless="true"` on the script tag, all of the above keys are routed through `sessionStorage` instead of `localStorage`. Effect:

- Storage is tab-scoped and cleared when the customer closes the tab.
- No persistent visitor identifier survives across sessions.
- The engagement `return_visitor` trigger stops firing (expected trade-off).
- Dismissal is only remembered for the current session.

In cookie-free mode, under most EU cookie-consent regimes the widget should not require prior consent because the storage is strictly functional and session-scoped. **Confirm with your own legal counsel** before claiming this on the record.

## Host-site consent integration

The widget listens for `window.postMessage` events of shape:

```js
window.postMessage(
  { type: "bizassist.consent", state: "granted" | "denied" },
  "*"
);
```

- `denied` — forces the widget into cookie-free mode for the current session, even if the tenant had it disabled. Any existing localStorage entries remain but are not written to.
- `granted` — the widget behaves according to its default configuration. If the tenant has cookie-free mode enabled, that still overrides host consent (tenant setting is more restrictive).

This channel lets a host-side cookie consent manager (Cookiebot, OneTrust, Osano, etc.) broadcast the customer's choice after the widget has already loaded. For a true consent-first load, the host should also omit the widget script tag until consent is granted, or set `data-cookieless="true"` as a safe default.

## What is NOT stored

- HTTP cookies (any).
- IndexedDB entries.
- Service workers.
- Web SQL, cache storage.
- Browser fingerprints or canvas data.
- Third-party analytics (Google Analytics, Mixpanel, etc.) — BizAssist does not ship with any.

## Verification

To verify this audit against the current code, run:

```bash
grep -rn "localStorage\|sessionStorage\|document.cookie" \
  apps/web/public/widget.js \
  apps/web/components/chat/chat-window.tsx
```

Any new entry must be added to the tables above and reflected in the privacy policy generator's cookie section (`apps/web/lib/compliance/policy-template.ts`).
