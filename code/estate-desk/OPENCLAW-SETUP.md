# OpenClaw + WhatsApp integration

The tested integration uses a linked WhatsApp account named `shellsworth`.
WhatsApp link state and credentials are not included in this repository. The
integration does not replace the Shellsworth personality globally.
A more-specific direct-peer binding routes only the number configured in
`ALLOWED_WHATSAPP_PHONE` to the
`estate-desk` agent; the existing account-level Shellsworth binding remains the
fallback for other allowlisted contacts.

## Message path

1. The conversation begins and continues in WhatsApp.
2. OpenClaw routes the one test direct chat to the isolated Estate Desk agent.
3. The agent has no tools and receives a fixed historical Gurgaon catalog in its
   bootstrap context.
4. A local internal hook mirrors successful inbound and outbound text to
   `http://host.docker.internal:3000/api/whatsapp/events`.
5. The server accepts only the shared secret, account `shellsworth`, WhatsApp
   channel, and configured allowlisted phone. Event IDs are deduplicated.
6. The dashboard is read-only for conversation text and refreshes every 10 seconds.

The sanitized hook, policy plugin and agent instructions are versioned under
this repository's `openclaw/` directory. In a Docker deployment, copy the policy
plugin into the image with non-world-writable permissions rather than mounting
it from a writable host directory.

## Start locally

Apply both D1 migrations, run the web server, then recreate the OpenClaw
container so it reads the added environment values and workspace mount:

```powershell
cd code\estate-desk
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0000_early_sugar_man.sql
npx wrangler d1 execute site-creator-d1 --local --config wrangler.local.json --file drizzle/0001_whatsapp_sync.sql
npm run dev

# Change to the directory containing your private OpenClaw docker-compose.yml.
docker compose up -d --force-recreate openclaw-gateway
docker compose exec openclaw-gateway openclaw hooks info estate-desk-sync
docker compose exec openclaw-gateway openclaw plugins inspect estate-desk-policy --runtime --json
docker compose exec openclaw-gateway openclaw status --deep
```

Open `http://localhost:3000/login`, associate the value configured in
`ALLOWED_WHATSAPP_PHONE`, and use the
displayed demo code when Twilio Verify is not configured. Then send a message in
the WhatsApp self-chat. The transcript should appear at `/leads`.

## Safety boundary

The route binding, tool denial, isolated workspace, input policy hook, output
rewrite/cancellation hook, webhook allowlist, and server-side qualification are
independent layers. They materially limit prompt-injection consequences but are
not an honest guarantee that a language model can never produce a confused
answer. Keep a human advisor responsible for prices, availability, legal facts,
contact consent, and meeting confirmation.

The current webhook URL is local because the OpenClaw gateway is local. A hosted
private dashboard cannot receive unauthenticated Internet webhooks through its
owner-only access wall. For production, put the local receiver behind an
authenticated private tunnel or move event ingestion to a dedicated public
webhook service while keeping the dashboard data authenticated.
