# Aman Kapoor — Estate Desk work journal

**Student:** Aman Kapoor

**Roll number:** 1024240140

**Updated:** 13 September 2026

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
