# Estate Desk web application

This Vinext/React application is the manager console for the Estate Desk
WhatsApp assistant. It stores each phone-authenticated workspace in Cloudflare
D1 and accepts signed message events from the local OpenClaw bridge.

## Configuration

Copy `.env.example` to `.dev.vars` and set:

- `WHATSAPP_SYNC_SECRET`: a long random value shared only with the OpenClaw hook;
- optional Twilio Verify credentials for real SMS verification.

Never commit `.dev.vars`. Without Twilio, the UI clearly reports demo mode and
accepts OTP `123456`.

## Local setup

```powershell
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_early_sugar_man.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_whatsapp_sync.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0002_long_cannonball.sql
npm run dev
```

Open `http://localhost:3000/`. Create or enter a phone workspace, verify it,
then finish onboarding by uploading an authorized CRM CSV and a listing CSV.
Templates are available from the onboarding screen.

## Validation

```powershell
npx tsc --noEmit
npx tsx --test tests/domain.test.ts
npm run build
node tests/api-smoke.mjs
```

The smoke test expects the dev server on port 3000, all three local D1
migrations and `WHATSAPP_SYNC_SECRET=estate-desk-local-sync-test-2026` in
`.dev.vars`.

## Data and live updates

- `data/gurgaon-kaggle/RealEstate(gurgaon).csv`: complete 3,909-row source file.
- `data/properties.json`: normalized 120-property sample catalog.
- `public/gurgaon-house-listings-kaggle.csv`: browser-downloadable test file.
- `public/crm-template.csv`: CRM import example.
- `/api/workspace/stream`: server-sent event feed used by all dashboard screens.

The Overview page adds contacts and listings by form or CSV. The Meetings page
combines buyer details, conversation-derived requirements, recommended
properties and physical-meeting readiness. The Trends page compares inquiry
patterns with the property database. Manager exports include both agent-derived
fields and permitted chat fields.

See `DATA-SOURCES.md` for provenance and `OPENCLAW-SETUP.md` for the message
path. Historical records must never be described as confirmed live offers.
