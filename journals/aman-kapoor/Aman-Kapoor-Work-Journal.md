# Aman Kapoor — Estate Desk work journal

**Date:** 7 September 2026

**Project:** AI-Powered Customer Engagement Platform

## My contribution

My contribution in this iteration covered the product scope, dashboard,
property-data pipeline, WhatsApp/OpenClaw integration, safety controls, testing
and deployment of the Estate Desk prototype.

I refined the broad customer-engagement proposal into a concrete real-estate
workflow. Buyers communicate on WhatsApp; the website is an advisor dashboard
that shows conversation summaries, requirements, property matches, lead status,
evidence and recommended follow-up. The AI is intentionally restricted to
Gurugram property discovery, catalog details, requirement collection and viewing
interest. It does not answer unrelated requests or independently confirm a
meeting.

## Work completed

### Application and experience

- Built the multi-page Vinext/React dashboard for overview, leads, properties,
  connections, agent setup and phone association.
- Added ChatGPT-based workspace identity and a simulated CRM with one test
  contact.
- Added property filters, lead notes, transcript export, CSV upload and a human
  advisor viewing-proposal flow.
- Kept conversation text read-only on the website so the channel of record stays
  WhatsApp.

### Property dataset

- Imported and normalized the Gurgaon real-estate Kaggle dataset.
- Preserved the complete 3,909-row CSV for testing and exposed a downloadable
  copy from the app.
- Generated a deterministic 120-listing catalog for fast matching and agent
  context while retaining source-row metadata and historical-data warnings.

### WhatsApp and OpenClaw

- Created an isolated `estate-desk` OpenClaw workspace with a dedicated identity,
  real-estate rules and fixed catalog context.
- Configured a peer-specific WhatsApp route so the Estate Desk personality does
  not replace the Telegram agent or other WhatsApp personalities.
- Added a local message hook that mirrors successful inbound and outbound text
  events to a signed dashboard endpoint.
- Added an independent policy plugin that blocks non-WhatsApp destinations,
  non-allowlisted contacts, suspicious prompts and out-of-scope output.
- Removed tools from the real-estate agent and used a fail-closed single-number
  allowlist.

### Persistence and safeguards

- Added Cloudflare D1 tables for workspaces, phone ownership, verification
  challenges and deduplicated WhatsApp events.
- Added optimistic revision checks to prevent silent overwrites when dashboard
  and WhatsApp updates arrive close together.
- Implemented STOP/START consent handling, input length limits, origin checks,
  event authentication, account/channel checks and server-side qualification.
- Ensured the public repository contains no live tokens, link state or personal
  WhatsApp number. Private values are supplied through ignored environment files.

### Testing and delivery

- Added ten domain tests covering matching, qualification, budget conversion,
  prompt rejection, consent and WhatsApp event handling.
- Added API smoke tests for authentication, phone association, signed events,
  deduplication, invalid actions, page routes and dataset download.
- Completed TypeScript checking and a production build.
- Deployed an owner-authenticated application build and documented the remaining
  production webhook/tunnel requirement.

## Problems encountered and resolutions

The OpenClaw policy plugin initially could not be loaded safely from a writable
Windows Docker bind mount. I moved the plugin into a custom container image with
non-world-writable permissions. The large dataset also affected local file
watching, so generated/archive files were excluded and the runtime catalog was
kept intentionally small. Finally, the hosted dashboard could not directly
receive events from a local WhatsApp gateway; I documented the current local
sync and the authenticated webhook/tunnel change required for production.

## Result

The iteration produced a working, testable vertical slice: a permitted WhatsApp
message reaches a narrowly scoped property agent, the resulting event is stored,
and an advisor can see what the buyer wants and whether to qualify, nurture,
stop or schedule a viewing. The remaining work is production CRM integration,
role-based access, a production-grade webhook and live inventory verification.
