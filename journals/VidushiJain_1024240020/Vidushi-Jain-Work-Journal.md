# Vidushi Jain -- Campaign pipeline work journal

**Date:** 12-13 September 2026

**Project:** AI-Powered Customer Engagement Platform

## My contribution

My contribution in this iteration was the multi-campaign conversation
pipeline: the allowlisted-contact model, the immutable raw-message ledger,
deterministic requirement extraction, deterministic property matching, and
the human-handoff workflow, together with the manager-facing dashboard
screen and the tests that back all of it. This builds on top of the
`campaigns` / `campaign_contacts` / `properties` / `handoffs` tables and
routes I had already started (allowlist and property CSV import, campaign
creation, the initial handoff endpoint) and turns them into a working,
end-to-end conversation flow rather than a set of disconnected tables.

## Work completed

### Recovering the build

Before I could add anything, the project would not build at all. Every API
route, the dashboard UI, and the full domain test suite imported from
`lib/domain.ts`, `lib/store.ts` and `lib/campaigns.ts`, but none of those
three files existed anywhere in the git history on any branch. I traced this
back to a bare `lib/` rule in the repository's root `.gitignore`, which
matches a folder named `lib` at *any* depth -- including
`code/estate-desk/lib/` -- so these files were most likely written locally at
some point and then silently excluded from every commit rather than never
written at all. I reconstructed all three files (plus a fourth, missing
`lib/utils.ts` that every shadcn UI component depends on) by inferring their
exact contract from every call site: the existing API routes, the dashboard
component, and -- most usefully -- the pre-existing `tests/domain.test.ts`
suite, which I treated as the authoritative specification. All ten of those
tests pass against my reconstruction without modification, `npx tsc --noEmit`
is clean, and `npm run build` succeeds.

### Allowlist and outbound send safety

- Added `lib/messaging.ts`, with `assertOutboundMessageAllowed` as the single,
  server-side, fail-closed authorization check every outbound send must pass:
  invalid phone -> not on the campaign's allowlist -> opted out -> paused for
  handoff or closed -> campaign does not exist. Nothing about who may be
  contacted is trusted from the agent, the request body, or a cached value --
  it is re-read from D1 on every call.
- Added `opted_out` and `agent_paused` columns to `campaign_contacts` so
  consent and human-handoff pausing are tracked as two independent,
  explicit flags rather than overloading `status`.
- Added STOP-family opt-out detection and an exact-`START` opt-in, and
  natural-language human-handoff phrase detection ("speak to a human",
  "connect me to an agent", a bare "2", and so on) in the same module.

### Raw messages, extraction and matching

- Added `campaign_messages` as an immutable ledger, unique on
  `(campaign_id, provider_message_id)` so the same inbound or outbound event
  can never be recorded twice, with the full transcript reconstructable in
  chronological order.
- Added `lib/requirements.ts`, a deterministic, regex-based requirement
  extractor (rooms, property type, budget range, preferred locations,
  required/preferred amenities, move-in date, missing fields, and a
  per-field confidence score). It is documented as a stand-in for a real
  LLM-backed extraction agent -- there are no AI provider credentials
  configured in this environment -- but it is written behind a stable
  interface so a real provider can replace its internals later without
  touching any caller. A failed or unusable extraction never overwrites a
  previously valid `campaign_requirements` row.
- Added `lib/matching.ts`: hard filters (budget, bedroom count) are applied
  before scoring, at most five properties are ever returned, every match
  carries human-readable reasons, and a hot-property demand bonus can never
  override a hard requirement.
- Added `lib/campaign-pipeline.ts` to tie ingestion, opt-out/opt-in,
  handoff creation, extraction and matching together behind two entry
  points (`recordInboundMessage`, `recordOutboundMessage`) so every route
  that touches messages shares identical, tested logic.

### Human handoff and manager auth

- Added `resume-agent` and `pause-agent` endpoints. Resuming after a
  handoff is restricted to an authenticated manager session -- never to the
  OpenClaw agent itself, even holding the shared sync secret -- so the agent
  can genuinely never resume itself.
- Added `lib/campaign-auth.ts`: manager-facing reads and actions now accept
  either an authenticated dashboard session or the existing
  `CAMPAIGN_SYNC_SECRET`, replacing the "no auth" and "trust the sync
  secret for everything" state the campaign routes started in. A manager
  session is also scoped to campaigns owned by their own workspace, derived
  from their identity rather than trusted from the request body.
- Added `campaigns/:id/handoffs` to list the handoff queue for a campaign.

### Dashboard

- Added a `/campaigns` section to the existing single-page dashboard: a
  campaign picker, the handoff queue, the full raw transcript for a
  selected conversation, the structured requirement summary with missing
  fields and confidence, the top matched properties with match reasons, and
  the manager-only resume control.

### Testing and migrations

- Added `tests/messaging.test.ts` (allowlist enforcement, opt-out
  stickiness, human-handoff phrase detection) and
  `tests/campaign-matching.test.ts` (hard-filter correctness, the five-match
  cap, hot-property bonuses never beating a hard requirement, extraction
  correctness) -- 18 new tests, all passing alongside the original ten.
- Extended `tests/api-smoke.mjs` with a full campaign-pipeline scenario
  (allowlist rejection, idempotent duplicate handling, opt-out/opt-in,
  handoff, and the manager-vs-agent authorization boundary on
  `resume-agent`).
- Generated migrations `0003_campaign_conversation_pipeline.sql` and
  `0004_campaign_message_delivery_status.sql` through `drizzle-kit generate`
  from an updated `db/schema.ts`, then applied all five migrations to a
  local D1 database with `wrangler d1 execute` to confirm they run cleanly
  end to end, not just as generated SQL.

## Problems encountered and resolutions

The missing `lib/` files were the biggest blocker, and the root cause -- a
`.gitignore` rule that was almost certainly meant for something else
entirely swallowing a whole subproject's source directory -- was not obvious
until I checked `git log --all` for those specific paths and cross-checked
`git check-ignore`. Getting the reconstructed `Brief` type right took two
passes: the domain test suite implied one shape (a structured object) while
the dashboard UI's existing JSX implied another (rendered strings), and
since the UI had never actually compiled before, I treated the test suite as
authoritative and adjusted `brief()` to produce human-readable strings with
an `evidence` array whose length still matches what the tests expect.

Separately, transferring the finished work out of my sandboxed environment
into the real repository turned out to be its own project. A full-tree zip
copy caused near-universal false "modified" noise from a Windows/Linux
line-ending mismatch. A git patch then failed to apply because non-ASCII
characters I had written (an em dash, a rupee sign, a "<=" symbol) were
mangled somewhere in the download/save round trip; I removed all non-ASCII
characters from every file I had touched and confirmed the regenerated
patch was pure ASCII, but the patch still failed because *pre-existing*
unrelated lines elsewhere in `estate-app.tsx` were pulled into diff hunks as
context and carried their own long-standing non-ASCII characters. I settled
on a more robust delivery: a zip containing only the brand-new files (no
merge risk, since none of the target paths existed yet) plus plain
copy-paste instructions in chat for the small number of edits to existing
files, which sidesteps the whole encoding problem. On the Windows side, a
locked native binary (`lightningcss.win32-x64-msvc.node`) also caused
`npm ci` to fail with `EPERM` after a stray Node process kept it open; a
clean `node_modules` wipe and `npm install` resolved it.

## Result

The campaign track now works as a real pipeline rather than a set of
tables with no logic connecting them: an allowlisted number can message in,
its requirements are extracted and matched against the campaign's property
inventory without ever exceeding five results, an explicit request for a
human pauses the agent and raises a handoff a manager can see and act on,
and every one of those steps is covered by a test that fails if the
behaviour regresses. Remaining work is wiring a real WhatsApp/OpenClaw
integration into these endpoints (nothing calls them in production yet),
Google Drive CSV import, and a human review pass over the reconstructed
`lib/domain.ts`, `lib/store.ts` and `lib/campaigns.ts`, since they were
inferred from call sites rather than written by their original author.
