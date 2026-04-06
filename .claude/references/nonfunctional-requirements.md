# Non-Functional Requirements

## Performance
| Metric | Target |
|---|---|
| Chat time to first token | <1.5s (p50), <3s (p95) |
| Chat full response | <5s (p95) |
| Widget load time | <1s on 4G |
| Config endpoint | <100ms (p95, edge cached) |
| Knowledge ingestion | <5 min upload to active |
| Dashboard page load | <2s (p95) |

## Reliability
| Metric | Target |
|---|---|
| Platform uptime | 99.9% |
| LLM failover time | <30s automatic |
| Data durability | 99.999999999% |
| RPO | <1 hour |
| RTO | <4 hours |
| Cross-tenant incidents | Zero (enforced by architecture + CI) |

## Security
- MFA enforced (TOTP or Google SSO MFA)
- Encryption: AES-256 at rest, TLS 1.3 in transit
- API keys: SHA-256 hashed, shown once at creation
- npm audit in CI
- Weekly automated red-team tests
- Annual third-party pentest

## GDPR
- Account deletion cascades: Postgres + Pinecone + Storage within 30 days
- Conversation retention: 90 days default (configurable 30-365)
- Pre-chat disclosure required
- Data export: JSON/CSV for all data
- Sub-processor list published

## Pricing (Working Assumption)
- Starter: $49/mo, 500 conversations
- Professional: $99/mo, 2,000 conversations
- Business: $199/mo, 5,000 conversations
