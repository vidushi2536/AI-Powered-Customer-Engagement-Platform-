# Prototype implementation status

## Delivered in the current iteration

The original proposal described a general AI customer-engagement concept. The
prototype narrows it to a testable real-estate workflow and uses WhatsApp as the
only buyer conversation channel.

| Area | Implemented state |
| --- | --- |
| User access | ChatGPT-authenticated dashboard with a separate phone association step |
| CRM | One configurable allowlisted contact for safe friend/family testing |
| Property data | Historical Gurgaon Kaggle CSV (3,909 rows), deterministic 120-row catalog and advisor CSV upload |
| Agent | Isolated `estate-desk` OpenClaw personality with no tools and catalog-only facts |
| Messaging | Signed inbound/outbound event sync from WhatsApp; no website chat |
| Lead intelligence | Requirements, status, evidence, matches, next action and viewing-interest escalation |
| Consent | STOP marks the lead opted out; START is required to resume |
| Security | Peer binding, server allowlist, body limits, deduplication, origin checks and input/output policy layers |
| Persistence | Cloudflare D1 workspaces, phone ownership, revision checks and event ledger |
| Delivery | Vinext production build and owner-authenticated Sites deployment |

## Verification completed

- Ten domain-level tests for qualification, budget conversion, property matching,
  prompt rejection, STOP/START and WhatsApp ingestion.
- Authenticated API smoke coverage for workspace access, phone association,
  signed webhook events, deduplication, invalid actions and all dashboard routes.
- TypeScript type-check and production application build.
- Full CSV download endpoint and catalog-load checks.

## Known constraints

- The CRM is simulated and intentionally contains one contact.
- Phone verification falls back to a clearly labelled demo code unless Twilio
  Verify credentials are provided.
- The hosted dashboard is private, while the current WhatsApp event receiver is
  local. Production messaging needs an authenticated private tunnel or a
  dedicated public webhook service.
- The model guardrails reduce risk but do not replace human review. A human must
  confirm pricing, availability, consent, legal facts and meeting details.

## Next engineering increment

Replace the simulated CRM with an authorised connector, add tenant-level contact
consent records, move WhatsApp ingestion to a production webhook, introduce
role-based access and add end-to-end tests against a disposable OpenClaw gateway.
