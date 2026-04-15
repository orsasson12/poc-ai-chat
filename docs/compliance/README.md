# BizAssist Compliance Documents

This folder holds the compliance templates and operational runbooks that accompany the platform. Every document starts with the same disclaimer:

> **Not legal advice.** These templates are a starting point, not a finished legal document. Review every file with a qualified EU data protection lawyer before relying on it with real customers.

## Contents

| File | Audience | Purpose |
|------|----------|---------|
| [`dpa-template.md`](./dpa-template.md) | Business owners (controllers) | Data Processing Agreement between BizAssist (processor) and the tenant (controller). |
| [`sub-processors.md`](./sub-processors.md) | Public / customers | Authoritative list of third parties that process data on BizAssist's behalf. Mirrored from `apps/web/lib/compliance/sub-processors.ts`. |
| [`security-measures.md`](./security-measures.md) | Auditors, enterprise buyers | Technical and organisational measures (Article 32) BizAssist implements. |
| [`breach-procedure.md`](./breach-procedure.md) | Internal ops | Incident-response runbook for data breach notification (Article 33/34). |
| [`ai-act-limited-risk-assessment.md`](./ai-act-limited-risk-assessment.md) | Business owners + auditors | Risk assessment template arguing the Limited Risk classification under the EU AI Act. |
| [`cookie-audit.md`](./cookie-audit.md) | Business owners | Audit of what the BizAssist widget and chat window store in the customer's browser, and how cookie-free mode changes that. |
| [`eu-data-residency-architecture.md`](./eu-data-residency-architecture.md) | Ops / infra | How to deploy BizAssist in the EU and pin tenants to EU infrastructure. |

## How this folder is kept in sync with the product

- `sub-processors.md` is regenerated whenever `apps/web/lib/compliance/sub-processors.ts` changes — the code file is the source of truth.
- `cookie-audit.md` must be re-verified whenever `public/widget.js` or `components/chat/chat-window.tsx` change the storage calls.
- `DPA_VERSION` (in `sub-processors.ts`) must be bumped whenever `dpa-template.md` changes materially, so that existing tenants are prompted to re-accept.

## Related dashboard surfaces

- `/compliance` (Settings tab) — data region, retention, AI disclosure, cookieless toggle, DPA acceptance.
- `/compliance` (Subject requests tab) — file and track Article 15 / 17 requests.
- `/compliance` (Privacy notice tab) — generate a Markdown snippet owners can paste into their own privacy policy.
- `/compliance` (Sub-processors tab) — read-only render of `SUB_PROCESSORS`.
