# Estate Desk web application

This Vinext/React application is the multi-broker manager console for Estate
Desk. Google OAuth protects each workspace and Cloudflare D1 stores isolated
CRM, listing, conversation and agent state. A built-in cloud simulator supports
agent testing before any external messaging provider is connected.

## Configuration

Copy `.env.example` to `.dev.vars` and set:

- `WHATSAPP_SYNC_SECRET`: a long random value shared only with the OpenClaw hook;
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: credentials for a Google OAuth
  web application;
- `GOOGLE_REDIRECT_URI`: the exact Estate Desk callback URL.

Never commit `.dev.vars` or paste production secrets into source files.

For local development, register this exact redirect URI in Google Cloud:

`http://localhost:3000/api/auth/google/callback`

The production redirect must use HTTPS and match the deployed domain exactly.

## Local setup

```powershell
npm ci
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_early_sugar_man.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_whatsapp_sync.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0002_long_cannonball.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0003_google_oauth.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0004_cloud_whatsapp.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0005_workspace_isolation.sql
npm run dev
```

Open `http://localhost:3000/`, continue with Google, and finish onboarding by
adding the broker number plus an authorized CRM CSV and listing CSV. The cloud
simulator lets each broker test their own agent without installing software or
connecting a messaging provider.

## Multi-broker isolation

Google identities resolve to separate workspace IDs. Contacts and message
events use composite workspace keys, so the same buyer phone can safely exist
in multiple broker CRMs. Agent qualification always receives one workspace's
contacts, conversation history and property catalogue; live dashboard streams
are authenticated to that same workspace.

Run the isolation checks with the local server running:

```powershell
npx tsx --test tests/domain.test.ts
node tests/multi-tenant-smoke.mjs
```
Templates are available from the onboarding screen.

## Recommended free deployment

Cloudflare Workers + D1 is the best fit because this application already builds
as a Cloudflare Worker and uses D1. The current free plan includes a daily
Workers request allowance and free D1 quotas suitable for a prototype.

Deployment order:

1. Create a Cloudflare D1 database and apply all SQL files in `drizzle/`.
2. Bind that database as `DB` in the Worker configuration.
3. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and
   `WHATSAPP_SYNC_SECRET` as encrypted Worker secrets.
4. Deploy the generated Worker and static client.
5. Add `https://<your-domain>/api/auth/google/callback` to the Google OAuth
   client's authorized redirect URIs, then set the same value in the Worker.

The web dashboard can stay fully serverless. OpenClaw's WhatsApp Web gateway is
a separate long-running process and must remain on the broker's computer or an
always-on server; a static host cannot run that gateway.

## Validation

```powershell
npx tsc --noEmit
npx tsx --test tests/domain.test.ts
npm run build
node tests/api-smoke.mjs
```

The smoke test expects the dev server on port 3000, all local D1
migrations and `WHATSAPP_SYNC_SECRET=estate-desk-local-sync-test-2026` in
`.dev.vars`.

## Troubleshooting the local WhatsApp connection

The website, OpenClaw gateway and Estate Desk bridge are three separate local
processes. The bridge must remain running on `127.0.0.1:18791`; otherwise the
website cannot request a QR even when Docker reports a healthy gateway.

```powershell
cd openclaw\runtime
node server.mjs
```

- A reconnect normally takes 10–30 seconds. More than one minute means it is
  stuck or the bridge is offline.
- A `401 conflict` means the old linked-device session is terminal. Clear only
  that OpenClaw WhatsApp account's stale credentials and generate a fresh QR.
- If the agent reports OpenRouter billing while OpenAI OAuth is valid, inspect
  `openclaw agents list --json`. Estate Desk agents must not have a `model`
  override; they inherit `agents.defaults.model.primary`.
- OpenAI OAuth and OpenRouter billing are separate. A ChatGPT/OpenAI OAuth
  profile does not provide credits to an OpenRouter API key.

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
