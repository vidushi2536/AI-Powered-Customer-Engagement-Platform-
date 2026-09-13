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

## Campaign pipeline (2026-09-12 increment)

A second, multi-tenant track now sits alongside the single-workspace demo:
campaigns each have their own allowlisted contacts, property inventory, raw
message ledger, structured requirements and deterministic top-five matches.

| Area | State |
| --- | --- |
| Allowlist | `campaign_contacts` gains `opted_out` / `agent_paused` flags; every outbound send is re-validated server-side via `assertOutboundMessageAllowed` (`lib/messaging.ts`), which fails closed on an invalid phone, unknown contact, opt-out, pause, or missing campaign |
| Raw messages | `campaign_messages` is an immutable, idempotent ledger (unique on `campaign_id` + `provider_message_id`) reconstructable in chronological order |
| Requirement extraction | `lib/requirements.ts` is a deterministic, regex-based stand-in for a real `RequirementExtractionProvider` (no AI credentials are configured in this environment); a failed/unusable extraction never overwrites a previously valid `campaign_requirements` row |
| Matching | `lib/matching.ts` applies hard filters (budget, bedroom count) before scoring, always returns <=5 properties, and never lets a hot-property bonus override a hard requirement |
| Handoff | An explicit request (`lib/messaging.ts#isHandoffRequest`) pauses the agent and creates a `handoffs` row; `agent_paused` only clears via the explicit `resume-agent` endpoint, never automatically |
| Opt-out | STOP-family keywords set `opted_out`; only an exact `START` clears it; opted-out contacts are rejected by the same allowlist check used for every other send |

Known gaps in this increment: no dashboard UI for the campaign track yet
(API-only), no real WhatsApp/OpenClaw wiring for `/api/campaigns/**` (the
routes exist and are tested, but nothing calls them in production yet), no
Google Drive CSV import, and `lib/domain.ts`, `lib/store.ts`,
`lib/campaigns.ts` and `lib/utils.ts` were reconstructed from call-site
inference (see git history -- none of the four existed anywhere on any
branch) rather than authored by the original team, so they should get a
human review pass.

## Next engineering increment

Replace the simulated CRM with an authorised connector, add tenant-level contact
consent records, move WhatsApp ingestion to a production webhook, introduce
role-based access and add end-to-end tests against a disposable OpenClaw gateway.
