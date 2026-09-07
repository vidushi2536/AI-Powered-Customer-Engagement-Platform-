# Estate Desk web application

This Vinext/React application is the advisor console for the Estate Desk
WhatsApp prototype. It stores each signed-in user's state in Cloudflare D1 and
accepts signed message events from a local OpenClaw hook.

## Configuration

Copy `.env.example` to `.dev.vars` and set:

- `ALLOWED_WHATSAPP_PHONE`: the only contact processed by this demo, in E.164
  format;
- `WHATSAPP_SYNC_SECRET`: a long random secret shared with the OpenClaw hook;
- optional Twilio Verify credentials for real SMS phone verification.

Never commit `.dev.vars`; it is ignored. The checked-in fallback number is a
non-personal placeholder.

## Local setup

```powershell
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_early_sugar_man.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_whatsapp_sync.sql
npm run dev
```

Open `http://localhost:3000/login`. Without Twilio credentials, use the clearly
labelled demo code `123456`.

## Validation

```powershell
npx tsc --noEmit
npx tsx --test tests/domain.test.ts
npm run build
node tests/api-smoke.mjs
```

The smoke test expects the dev server on port 3000, both local D1 migrations and
`WHATSAPP_SYNC_SECRET=estate-desk-local-sync-test-2026` in `.dev.vars`.

## Data

- `data/gurgaon-kaggle/RealEstate(gurgaon).csv`: complete 3,909-row source file.
- `data/properties.json`: normalized deterministic catalog used by the app.
- `public/gurgaon-house-listings-kaggle.csv`: browser-downloadable testing file.

See `DATA-SOURCES.md` for provenance and `OPENCLAW-SETUP.md` for the message
path. All records are historical samples and must not be represented as live
offers.
