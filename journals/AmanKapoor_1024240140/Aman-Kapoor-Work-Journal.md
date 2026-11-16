# Aman Kapoor — Estate Desk work journal

**Student:** Aman Kapoor

**Roll number:** 1024240140

**Group:** 3X11

**Course:** UCS503 — Software Engineering

**Project:** AI-Powered Customer Engagement Platform

**Updated:** 16 November 2026

## Project objective

My goal was to build a WhatsApp-first real-estate outreach system. Buyers should
talk naturally to an AI employee on WhatsApp, while the property manager uses a
website to understand leads, property demand and physical-meeting readiness.
The agent must only perform real-estate work, use verified listings and keep the
data of different users completely separate.

## Chronological development record

### Phase 1 — Idea, scope and first prototype

- Defined Estate Desk as a property-sales assistant instead of a general chatbot.
- Decided that buyer conversations would happen on WhatsApp, not on the website.
- Set the agent's main objective: collect buyer requirements, recommend suitable
  verified properties and identify interest in a physical visit.
- Created the first manager dashboard for conversations, leads and basic agent
  insights.
- Added the initial OpenClaw real-estate personality and kept it separate from
  the existing Telegram agent.

### Phase 2 — Property and CRM data

- Added CSV onboarding for CRM phone numbers and property listings.
- Imported the historical Gurgaon real-estate dataset containing 3,909 rows.
- Produced a normalized 120-property sample catalog for fast demonstrations.
- Added downloadable CRM and property templates.
- Added form-based options so users can add an individual client or property
  without preparing a CSV.
- Made `inbound-only` the default contact state so importing a number does not
  permit cold messaging.

### Phase 3 — Real WhatsApp and OpenClaw integration

- Linked a real personal WhatsApp account through OpenClaw's QR flow.
- Created an Estate Desk route and workspace separate from other OpenClaw agents.
- Added an allowlist so only authorized CRM contacts can receive replies.
- Added STOP/START handling and blocked unknown or opted-out contacts.
- Built a signed event hook to copy permitted inbound and outbound WhatsApp text
  into the Estate Desk application.
- Added deduplication so retried WhatsApp events do not create duplicate records.

### Phase 4 — Live lead intelligence

- Added server-sent events so dashboards update while conversations are happening.
- Extracted budget, bedrooms, preferred location, timeline and visit interest
  from the conversation history.
- Built lead qualification, next-action suggestions and property matching.
- Added downloadable CSV reports containing buyer details, agent analysis,
  meeting readiness, property matches and permitted chat information.
- Created live property-demand insights based on WhatsApp inquiries and the
  verified listing database.

### Phase 5 — Meetings and manager workflow

- Added a Meetings page for proposed, confirmed, rescheduled and completed visits.
- Added buyer-ready-for-physical-meeting states with the buyer's contact details.
- Added the exact properties, requirements and next steps needed before a visit.
- Kept final price, availability, legal details and meeting confirmation under
  human control.
- Simplified client briefs to two sections: chat summary and next steps.

### Phase 6 — Interface redesign

- Reworked the layout into Today, Leads & clients, Properties & insights, and
  Meetings.
- Moved client and property creation to their relevant pages instead of the home
  screen.
- Combined property information and demand insights into one focused experience.
- Added a light peach-and-orange visual system, improved typography, animated
  navigation and responsive layouts.
- Added larger mobile controls, visible focus states, empty states, saved lead
  filters and clearer status labels.
- Removed repeated viewing actions and screens that made the workflow confusing.

### Phase 7 — Grounding and safety improvements

- Restricted the agent to real-estate discovery, property requirements and
  physical-visit interest.
- Added checks for jailbreaks, instruction extraction and unrelated tasks.
- Prevented the agent from inventing properties, prices, bedrooms, amenities,
  availability or meetings.
- Required every recommendation to match a property ID in the active workspace
  catalog.
- Fixed cases where a 3 BHK could appear in a 5 BHK request or an unavailable
  6 BHK could be invented.
- Updated the response style so the agent sounds like a natural employee and
  returns only the customer-facing message without exposing its reasoning.

### Phase 8 — Authentication and multiple users

- Replaced the shared phone-login prototype with Google OAuth.
- Added OAuth identities and isolated Cloudflare D1 workspaces.
- Separated each user's CRM, listings, messages, agent context, meetings and
  WhatsApp connection.
- Added composite workspace keys so the same buyer phone can exist in two CRMs
  without data leakage.
- Added multi-tenant tests proving that one user cannot access another user's
  contacts, listings or conversation history.

### Phase 9 — Per-workspace agents and plug-and-play setup

- Built a local authenticated Estate Desk runtime on port `18791`.
- Added website-controlled OpenClaw account and agent provisioning for each
  workspace.
- Added QR start, wait and status endpoints so WhatsApp can be linked during
  onboarding.
- Added live context synchronization for CRM allowlists, verified properties and
  meeting schedules.
- Changed provisioning so Estate Desk agents never store their own model choice.
  Every agent now inherits the operator's OpenClaw default model.

### Phase 10 — Testing, documentation and proposal

- Expanded the domain suite to 13 tests covering matching, qualification,
  consent, prompt rejection, grounding, WhatsApp ingestion and isolation.
- Added API smoke tests for authentication, onboarding, uploads, events, live
  streams, forms, STOP/START and blocked obsolete routes.
- Added a two-user smoke test for CRM, listing and conversation isolation.
- Added responsive meeting and property-table render tests.
- Rebuilt the proposal using the official TIET `tietreport` format.
- Added Aman Kapoor (1024240140), Vidushi Jain (1024240020), Group 3X11 and the
  UCS503 Software Engineering course information.
- Added four spread-out flow diagrams and generated the final proposal PDF.

### Phase 11 — Live contact and agent controls

- Fixed the Add client flow so every new CRM contact immediately refreshes the
  correct workspace agent's WhatsApp allowlist.
- Added a workspace-level Disable agent control that stops its OpenClaw channel
  from receiving or sending messages, with a safe Enable agent action to resume.
- Added per-client Disable and Enable controls so one contact can be removed
  from or restored to the allowlist without losing their history.
- Added a confirmed Delete contact action that removes the CRM record, lead,
  meeting data and stored conversation events, then refreshes the allowlist.
- Revalidated the production build, 13 domain tests and the live local runtime
  after the changes.

## Important problems and solutions

### WhatsApp QR failed with an internal reference

OpenClaw briefly rejected a new QR while closing an old socket. I added a safe
retry and replaced the technical reference with a useful message.

### “WhatsApp is still closing the previous connection” never finished

The website and Docker gateway were running, but the separate bridge on port
`18791` had stopped. Restarting `openclaw/runtime/server.mjs` restored QR access.
I added an explicit bridge-offline error and documented that a normal reconnect
should take only 10–30 seconds.

### WhatsApp returned a 401 conflict

The old linked-device session had become terminal. I cleared only that account's
stale WhatsApp credentials and generated a fresh QR. CRM, listings, messages and
agent files were preserved.

### Agent reported an unexpected billing error

The OpenClaw default used valid OpenAI OAuth, but older Estate Desk agents had
individual OpenRouter or Ollama overrides. The OpenRouter account had no credits
and returned a 402 error. I removed every per-agent model override, tested the
OpenAI OAuth route successfully and changed future provisioning to inherit the
gateway default automatically.

### Dashboard did not update from WhatsApp

The gateway initially had no valid dashboard sync target. I connected the signed
event path, added a live workspace stream and verified updates using synthetic
events before testing real messages.

## Current result

Estate Desk now supports multiple users with isolated data and separate agents.
An authorized buyer messages a user's WhatsApp number, the grounded agent learns
their needs and recommends only verified catalog properties, and the website
updates lead, demand and meeting information in real time. The manager can see
who needs follow-up, who is ready for a physical visit and what properties to
show, without reading every message manually.

## Remaining production work

- Move the long-running WhatsApp runtime from the pilot laptop to an always-on
  cloud service.
- Replace personal WhatsApp Web linking with Meta Embedded Signup when a
  WhatsApp Business account is available.
- Add role-based teams, production CRM connectors, backups and monitoring.
- Replace historical sample listings with verified live inventory feeds.
