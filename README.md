# Estate Desk — AI-Powered Customer Engagement Platform

Estate Desk is a WhatsApp-first real-estate lead and meeting assistant for
Gurugram. Buyers talk to a narrowly scoped OpenClaw agent through WhatsApp. The
website gives the property manager live summaries, buyer requirements, matched
properties, meeting readiness and market trends. There is no buyer chat on the
website.

Authors: **Aman Kapoor and Vidushi Jain**

Course: **UCS503 — Software Engineering Project, TIET Patiala (2026–27 Odd)**

## Current application

- Google OAuth sign-in with a separate private workspace for each user.
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
- Per-workspace OpenClaw agents and WhatsApp accounts with isolated CRM,
  listing, conversation and meeting context.
- Adding a client immediately refreshes that workspace's OpenClaw allowlist;
  contacts remain inbound-only until they message first or explicitly opt in.
- The Overview control can disable one workspace agent at the channel level,
  stopping OpenClaw from receiving or sending its WhatsApp messages until the
  agent is enabled again.
- Client records can be disabled without losing history, or permanently deleted
  with their stored conversation history; both actions refresh the allowlist.
- Model inheritance: Estate Desk agents always use the OpenClaw gateway's
  current default model instead of storing their own provider override.

## Repository layout

```text
code/estate-desk/       Vinext/React app, APIs, D1 schema, tests and sample data
openclaw/               Secret-free workspace, policy, hooks and WhatsApp runtime
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
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0003_google_oauth.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0004_cloud_whatsapp.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0005_workspace_isolation.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0006_openclaw_runtime.sql
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/). Sign up with the phone
number that owns the linked WhatsApp workspace, then upload the CRM and listing
files. See [`code/estate-desk/OPENCLAW-SETUP.md`](code/estate-desk/OPENCLAW-SETUP.md)
for the local OpenClaw bridge.

## Common local fixes

### “WhatsApp is still closing the previous connection”

This should take only 10–30 seconds. If it lasts more than one minute, check
that the long-running bridge is listening on port `18791`. The website and
Docker gateway can both be healthy while this separate process is stopped.

```powershell
cd openclaw\runtime
node server.mjs
```

Then refresh onboarding, select **Connect WhatsApp** once and scan the new QR.
If WhatsApp reports a terminal conflict, clear only that workspace account's
dead session and request a new QR; do not delete its CRM or property data.

### OpenRouter billing error while OpenAI OAuth is active

Check `openclaw models status --json` and `openclaw agents list --json`. The
gateway default and every Estate Desk agent should resolve to the same model.
A per-agent value such as `openrouter/~openai/gpt-luna-latest` bypasses OpenAI
OAuth and uses OpenRouter credits instead. Remove the agent's `model` field so
it inherits `agents.defaults.model.primary`. New Estate Desk agents are created
without `--model`, so later default-model changes apply automatically.

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
