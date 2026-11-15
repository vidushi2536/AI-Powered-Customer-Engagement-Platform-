# Aman Kapoor — Estate Desk work journal

**Student:** Aman Kapoor

**Roll number:** 1024240140

**Updated:** 15 November 2026

**Project:** AI-Powered Customer Engagement Platform

## My contribution

I changed the earlier prototype into a complete WhatsApp-first real-estate
manager application. Buyers continue to speak on WhatsApp. The website now
starts with phone login, collects CRM and property data, and then opens a live
dashboard. The final goal of the agent is to understand the buyer and help the
manager arrange a physical visit to one or more suitable properties.

## Work completed

### Login and onboarding

- Built a new landing page with phone-number sign-up and login.
- Added OTP verification with optional Twilio Verify and a labelled demo mode.
- Made CRM and property-file onboarding compulsory before dashboard access.
- Added CSV templates, validation and clear consent confirmation.

### Manager dashboards

- Rebuilt the Overview page around useful lead and message statistics.
- Added form and CSV options for adding new clients and properties.
- Built a Meetings dashboard that lists meeting-ready buyers, contact details,
  budget, bedroom choice, location, timeline and the exact properties to show.
- Built a Trends dashboard showing the locations, property types and listings
  mentioned most often in buyer conversations.
- Added downloadable CSV reports containing buyer details, agent analysis,
  meeting readiness, property matches and permitted chat data.

### Real-time WhatsApp data

- Added signed inbound and outbound WhatsApp event ingestion.
- Added deduplication so a retried webhook does not create repeated messages.
- Added a server-sent event stream so every dashboard refreshes while a buyer
  conversation is happening, without manually reloading the page.
- Added a CRM watcher that updates OpenClaw contact routes and property context
  when the manager changes the workspace data.

### Agent behavior and safety

- Kept the Estate Desk personality separate from the Telegram personality.
- Restricted it to property requirements, catalog recommendations and physical
  visit interest.
- Added separate input and output policy checks for suspicious or unrelated
  prompts.
- Kept unknown contacts blocked, made `inbound-only` the default, and applied
  STOP/START consent handling.
- Kept price, availability, legal facts and meeting confirmation under human
  control.

### Data, storage and testing

- Imported the historical Gurgaon real-estate dataset with 3,909 rows and made
  it downloadable for testing.
- Kept a normalized 120-property sample catalog for fast matching.
- Extended the Cloudflare D1 schema for phone workspaces, multiple contacts,
  conversation events and live state revisions.
- Added eleven domain tests and API smoke coverage for authentication,
  onboarding, uploads, WhatsApp events, consent, matching and page routes.
- Removed the unused old login, single-contact phone API and old dashboard
  component so the repository contains only the current application path.

## Problems and solutions

The biggest problem was joining a local WhatsApp gateway with a browser
dashboard. I used a signed webhook for message events and a local watcher for
CRM configuration. Another problem was stale dashboard data. I added a live
event stream and revision checks so close updates do not silently overwrite one
another. I also separated the OpenClaw agent from the main Telegram identity so
both can run at the same time.

## Result

The current version is a working vertical slice. An authorized buyer sends a
WhatsApp message, the real-estate agent gathers needs and suggests catalog
properties, and the manager sees the result live. The manager can identify who
is ready for a physical meeting, what to show them and what action to take next.
The remaining production work is a hosted per-owner WhatsApp connector, a real
CRM integration, role-based team access and live inventory verification.

## Project proposal update

- Rebuilt the project proposal in the official TIET `tietreport` format.
- Added the correct student names, roll numbers, Group 3X11, third-year status
  and UCS503 Software Engineering course details.
- Added four different flow diagrams covering the user journey, system
  architecture, live WhatsApp event pipeline and physical-meeting decision flow.
- Spread the diagrams across the proposal so that no two diagrams appear one
  after another.
- Added a bibliography and included the portable `tietreport.cls` file so the
  proposal source can be compiled outside the original Overleaf project.
- Generated and visually checked the final 17-page proposal PDF.

## Multi-user Estate Desk update — November 2026

- Replaced shared login state with Google OAuth identities and isolated D1
  workspaces for each user.
- Added separate CRM contacts, listings, WhatsApp connection, conversation
  history, agent context and meetings for every workspace.
- Added per-workspace OpenClaw provisioning and QR-based personal WhatsApp
  linking without simulated messages.
- Added live clients, property intelligence and meetings screens with a lighter,
  animated responsive interface.
- Shortened client briefs to an at-a-glance chat summary and next action.
- Strengthened catalog grounding so unmatched bedrooms and unknown property IDs
  cannot be recommended or marked meeting-ready.
- Added multi-tenant smoke tests proving that two users can share a buyer phone
  without sharing CRM records, listings or messages.

## Hiccups and solutions — November 2026

### Website showed “WhatsApp is still closing the previous connection”

The Docker gateway was healthy, but the separate Estate Desk bridge on port
`18791` had stopped. The website therefore could not retrieve the QR. Restarting
`openclaw/runtime/server.mjs` restored the website-to-gateway path. I also added
clear offline and timeout messages, a safe reconnect retry, and documentation
that a normal reconnect takes 10–30 seconds rather than several minutes.

### WhatsApp session conflict during reconnect

The old linked-device session returned a terminal `401 conflict`. I cleared only
the affected OpenClaw WhatsApp credentials and generated a new QR. Workspace
CRM, listings, conversations and agent files were preserved.

### Unexpected billing error

The gateway default was `openai/gpt-5.6-luna` with valid OpenAI OAuth, but older
Estate Desk agents still had individual OpenRouter or Ollama model overrides.
The OpenRouter alias had no credits and produced a 402 billing error. I removed
all per-agent model overrides, verified a successful private OpenAI OAuth test,
and changed provisioning so every current and future Estate Desk agent inherits
the OpenClaw default model selected by the operator.
