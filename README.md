# Estate Desk — AI-Powered Customer Engagement Platform

Estate Desk is a WhatsApp-first real-estate lead and meeting assistant for
Gurugram. Buyers talk to a narrowly scoped OpenClaw agent through WhatsApp. The
website gives the property manager live summaries, buyer requirements, matched
properties, meeting readiness and market trends. There is no buyer chat on the
website.

Authors: **Aman Kapoor and Vidushi Jain**

Course: **UCS503 — Software Engineering Project, TIET Patiala (2026–27 Odd)**

## Current application

- Phone-number sign-up and login, with a clearly marked demo OTP (`123456`) when
  Twilio Verify is not configured.
- Guided onboarding for a CRM contact CSV and a property-listing CSV.
- Multi-contact workspaces with consent states: `inbound-only`, `opted-in` and
  `opted-out`.
- A 3,909-row historical Gurgaon dataset, a normalized 120-property sample
  catalog, and downloadable CSV templates.
- Live Overview, Meetings and Trends dashboards updated through server-sent
  events while WhatsApp conversations continue.
- Meeting-ready buyer cards containing contact details, requirements, matched
  properties and the latest useful conversation facts.
- Downloadable CSV exports combining agent analysis and permitted chat data.
- Signed and deduplicated WhatsApp event ingestion backed by Cloudflare D1.
- A separate OpenClaw real-estate personality, peer routing and an independent
  input/output policy that rejects unrelated or suspicious requests.
- STOP/START handling, contact authorization checks, message limits and human
  confirmation of prices, availability and physical meetings.

## Repository layout

```text
code/estate-desk/       Vinext/React app, APIs, D1 schema, tests and sample data
openclaw/               Secret-free workspace, sync hook, policy and CRM bridge
docs/                   MkDocs documentation and project diagrams
journals/               Individual contribution journals
project-proposal/       LaTeX project proposal
project-report-*/       Prototype and final report workspaces
```

## Run locally

Node.js 22.13 or newer is required.

```powershell
cd code/estate-desk
Copy-Item .env.example .dev.vars
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_early_sugar_man.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_whatsapp_sync.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0002_long_cannonball.sql
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/). Sign up with the phone
number that owns the linked WhatsApp workspace, then upload the CRM and listing
files. See [`code/estate-desk/OPENCLAW-SETUP.md`](code/estate-desk/OPENCLAW-SETUP.md)
for the local OpenClaw bridge.

## Validate

```powershell
cd code/estate-desk
npx tsc --noEmit
npx tsx --test tests/domain.test.ts
npm run build
node tests/api-smoke.mjs
```

The smoke test needs the local development server, all three migrations and the
test sync secret described in the application README.

All included listings are historical sample data, not live offers. A human
manager must verify price, ownership, availability, legal facts, consent and
meeting details before acting.
