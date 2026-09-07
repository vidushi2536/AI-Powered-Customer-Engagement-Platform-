# AI-Powered Customer Engagement Platform

Estate Desk is a WhatsApp-first real-estate lead qualification prototype for
Gurugram. A tightly scoped OpenClaw agent gathers budget, bedroom, location and
timeline requirements, recommends only catalogued properties, records viewing
interest and sends the conversation state to an advisor dashboard. The website
is an operations console; buyers converse through WhatsApp, not an on-site chat.

Authors: **Aman Kapoor and Vidushi Jain**

Course: **UCS503 — Software Engineering Project, TIET Patiala (2026–27 Odd)**

## Implemented prototype

- ChatGPT-authenticated, per-user dashboard with phone association.
- Simulated CRM with one configurable, allowlisted WhatsApp contact.
- 3,909-row Gurgaon/Gurugram Kaggle CSV plus a deterministic 120-listing app
  catalog and full-dataset download.
- Lead summary, requirements, evidence, property matches, follow-up state,
  advisor notes and viewing proposals.
- Signed, deduplicated WhatsApp event ingestion backed by Cloudflare D1.
- Isolated OpenClaw workspace, peer binding, no-tool agent and independent
  input/output policy plugin.
- STOP/START consent lifecycle, prompt-injection rejection, message limits and
  server-side validation.

The owner-authenticated prototype is deployed at
[estate-desk-lawbstah.kapooraman201.chatgpt.site](https://estate-desk-lawbstah.kapooraman201.chatgpt.site).
The linked WhatsApp gateway remains a local/private integration.

## Repository layout

```text
code/estate-desk/       Vinext/React application, APIs, D1 schema and dataset
openclaw/               Sanitized workspace, event hook and policy plugin
docs/                   MkDocs project documentation and diagrams
journals/               Individual contribution journals
project-proposal/       LaTeX proposal
project-report-*/       Prototype and final report workspaces
```

## Run the web application

Requirements: Node.js 22.13 or newer.

```powershell
cd code/estate-desk
Copy-Item .env.example .dev.vars
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_early_sugar_man.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_whatsapp_sync.sql
npm run dev
```

Put the single permitted E.164 number in `ALLOWED_WHATSAPP_PHONE`; never commit
the real value. Without Twilio credentials, phone verification is visibly in
demo mode and uses code `123456`. See
[`code/estate-desk/README.md`](code/estate-desk/README.md) and
[`openclaw/README.md`](openclaw/README.md) for full setup.

## Validate

```powershell
cd code/estate-desk
npx tsc --noEmit
npx tsx --test tests/domain.test.ts
npm run build
```

The API smoke test additionally requires the local development server and D1
migrations: `node tests/api-smoke.mjs`.

## Documentation

The MkDocs documentation is published by the existing GitHub Actions workflow
on pushes to `master` or `main`. For a local preview, install the documented
Python dependencies and run `make docs`.

All listings are historical sample data, not live offers. A human advisor must
verify price, ownership, availability, legal facts and consent before acting.
