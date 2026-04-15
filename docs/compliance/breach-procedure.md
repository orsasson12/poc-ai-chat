# Personal Data Breach Procedure

> **Not legal advice.** This runbook is an internal operational template. The actual notification timelines, content, and recipients must be validated by a qualified EU data protection lawyer before a real incident.

## Scope

A **personal data breach** under GDPR Article 4(12) means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data transmitted, stored or otherwise processed.

Examples that trigger this procedure:

- A database leak or SQL injection exposing tenant data,
- Unauthorised access to the production Supabase / Pinecone projects,
- A stolen employee laptop or credentials with production access,
- A sub-processor notifying us of a breach affecting our data,
- Accidental deletion or corruption of customer data (yes — availability breach is in scope),
- Canary token leak (see Section 7 — considered "high severity" by default because it indicates system prompt exfiltration).

## Team and roles

| Role | Who | Responsibilities |
|------|-----|------------------|
| **Incident Commander** | On-call engineer | Coordinates response, owns timeline, escalates when needed. |
| **Comms Lead** | Founder / CEO | Drafts notifications to controllers and DPAs; handles external questions. |
| **Technical Lead** | Platform engineer | Contains the breach, captures forensics, drives remediation. |
| **Legal / DPO** | External counsel | Advises on notification obligations and wording. |

## Timeline (target)

| T+ | Step |
|----|------|
| **0 minutes** | Incident detected. Incident Commander paged. |
| **30 minutes** | Initial triage complete. If confirmed as a breach, the 72-hour regulatory clock starts. |
| **2 hours** | Containment actions begun (rotate keys, revoke sessions, block attacker IP, etc.). |
| **12 hours** | Affected tenants identified. Draft controller notification prepared. |
| **24 hours** | Draft notification reviewed by legal. |
| **48 hours** | **Controllers notified** under clause 11 of the DPA. |
| **72 hours** | **Supervisory authority notified** under GDPR Article 33 — if we are the controller, or to assist a controller who is notifying. |
| **7 days** | Post-incident review scheduled. |
| **30 days** | Post-mortem published internally; preventative measures implemented. |

## Step-by-step

### 1. Detect

Sources: Axiom alerts, customer report, security researcher disclosure, employee observation, sub-processor notification.

Log the detection timestamp, detection channel, and initial evidence. This is the start of the 72-hour clock even if the assessment is not yet complete.

### 2. Triage

Answer three questions:

1. **Is this actually a breach of personal data?** (Not all security incidents are breaches.)
2. **What data is affected?** (Tenant IDs, data categories, approximate volume.)
3. **Is the breach ongoing?** (If yes, containment is the priority.)

If yes to question 1, set incident severity:

- **Critical**: >1 tenant affected, or a cross-tenant isolation failure, or credentials leaked.
- **High**: One tenant with sensitive data exposed (lead emails, chat transcripts).
- **Medium**: Limited metadata exposure (tenant names, counts).
- **Low**: Availability only, no confidentiality impact.

### 3. Contain

Apply the minimum-necessary actions to stop the breach:

- Rotate any credentials that may be compromised (Supabase service key, Pinecone API key, OpenAI / Anthropic keys, CRON_SECRET).
- Revoke user sessions if auth is implicated.
- Block attacker IP at the Vercel edge.
- Disable the affected feature flag, if applicable.
- Preserve logs — do NOT wipe; forensics need them.

### 4. Assess impact

Map the breach to:

- Categories of data subjects affected (end-customers, dashboard users),
- Categories of personal data (chat content, PII, billing data),
- Approximate number of records,
- Likely consequences (identity theft risk, embarrassment, financial loss, etc.),
- Measures already taken or planned.

### 5. Notify controllers

For every affected tenant, send a notification including:

1. A description of the breach (without prematurely attributing blame),
2. Categories and approximate number of data subjects and records,
3. Likely consequences,
4. Measures taken or proposed to address it,
5. A point of contact (named person + email).

Target: within **48 hours** of becoming aware, per DPA clause 11.

Template email: see `breach-procedure-templates/controller-notification.md` (create when needed; not included here to keep this document jurisdiction-neutral).

### 6. Notify supervisory authority (if applicable)

If BizAssist is the controller (e.g., for dashboard user data), notify the relevant EU Data Protection Authority within **72 hours** of becoming aware, per Article 33. This is a controller obligation; for tenant data we assist the controllers with their own notifications.

### 7. Canary token leaks

A canary token in a chat response indicates that the LLM included the tenant's system prompt verbatim. This is treated as **high severity** by default because it implies prompt exfiltration. Response:

1. Replace the affected response with the configured fallback message,
2. Log the event to `security_events` with `event_type = canary_leak`,
3. Rotate the canary salt for the affected tenant,
4. Audit the system prompt template for phrases that could trigger the leak,
5. Notify the tenant.

### 8. Post-mortem

Within 7 days of the incident being resolved:

- Blameless write-up: what happened, why, how we found out, how we contained, timeline.
- Preventative actions with owners and due dates.
- Shared internally; summary shared with affected tenants on request.

## Contacts

Update these in your deployment fork:

- Incident Commander rotation: {{oncall_rotation}}
- External legal / DPO: {{dpo_contact}}
- Supervisory authority: {{supervisory_authority_contact}}
