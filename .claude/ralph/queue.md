# Ralph Fix Queue

Missions run top-to-bottom. Driver checks the first `- [ ]` line and runs that mission.
Completed missions get marked `- [x]`. Failed missions get marked `- [!]` with a note.

## Scope: Critical + High (1-12)

- [ ] Mission 1 — Fix the invalid Claude model id
- [ ] Mission 2 — Add rate limiting to /api/chat
- [ ] Mission 3 — Harden request.json parsing
- [ ] Mission 4 — Abort Claude stream on client disconnect
- [ ] Mission 5 — Decide on middleware vs proxy
- [ ] Mission 6 — Fix React 19 set-state-in-effect errors
- [ ] Mission 7 — Reconcile model routing with the rules
- [ ] Mission 8 — Replace isFallback string-matching with a proper flag
- [ ] Mission 9 — Fix arbitrary grounded-check length threshold
- [ ] Mission 10 — Make logSecurityEvent a real no-op in mock mode
- [ ] Mission 11 — Batch tokens in mock streaming
- [ ] Mission 12 — Sanitize assistant-role history entries

## Log

(The driver appends a timestamped line here after each mission finishes.)
