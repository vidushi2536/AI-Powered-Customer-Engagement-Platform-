# OpenClaw + WhatsApp integration

Estate Desk uses the linked personal WhatsApp account named `shellsworth` as a
separate channel personality. It does not replace the Telegram agent. Buyers
talk on WhatsApp; managers sign in, manage data and review live results on the
website.

## Message and data path

1. A manager signs in with the phone number linked to the workspace.
2. The manager uploads an authorized CRM CSV and current property CSV.
3. The CRM watcher reads the workspace context, updates OpenClaw's WhatsApp
   allowlist and creates a direct Estate Desk route for every approved contact.
4. An approved contact messages the linked WhatsApp account.
5. OpenClaw routes the chat to the real-estate-only personality.
6. The event hook signs and mirrors inbound and outbound text to
   `/api/whatsapp/events`.
7. D1 stores deduplicated events and recalculates qualification, matches,
   trends, next action and meeting readiness.
8. `/api/workspace/stream` pushes the new state to every open dashboard in near
   real time.

## Start locally

Apply all three D1 migrations as shown in `README.md`, then run:

```powershell
cd C:\Users\bubblesk231\lawbstah\AI-Powered-Customer-Engagement-Platform\code\estate-desk
npm run dev
```

In another PowerShell window, keep the per-workspace WhatsApp bridge running:

```powershell
cd C:\Users\bubblesk231\lawbstah\AI-Powered-Customer-Engagement-Platform\openclaw\runtime
node server.mjs
```

Open `http://localhost:3000/`, sign in and complete onboarding. The sample
Gurgaon catalog remains available until the manager replaces or extends it.
The runtime provisions one OpenClaw account and agent per workspace. It updates
the WhatsApp allowlist and verified property context from the workspace APIs.
Agents do not store a model override: each one always inherits the gateway's
current default model.

## Recovery notes

- Keep the bridge on port `18791` running whenever the website needs to link or
  inspect WhatsApp. If it is stopped, restart `node server.mjs` and retry once.
- A reconnect should show a QR within 10–30 seconds. A persistent closing
  message is not normal.
- For a terminal `401 conflict`, log out only the affected OpenClaw WhatsApp
  account and request a fresh QR. CRM, listings and dashboard data stay intact.
- If a reply mentions OpenRouter billing, run `openclaw agents list --json`.
  Remove any Estate Desk agent `model` value so it inherits
  `agents.defaults.model.primary` and the configured OpenAI OAuth route.

## Safety boundary

Importing a number does not permit cold messaging. Contacts default to
`inbound-only`, so they must message first. Use `opted-in` only when valid
consent exists. STOP immediately prevents further replies; START is required to
resume.

The channel allowlist, per-contact routing, isolated workspace, input/output
policy, signed webhook and server-side validation are separate safeguards. The
agent is limited to real-estate discovery, requirements, catalog matches and
physical-visit interest. A human manager confirms prices, availability, legal
facts, consent and all meeting arrangements.

This integration is local because the personal WhatsApp session lives inside
the local Docker gateway. A hosted release needs an authenticated connection
service and webhook for each owner; a public dashboard cannot directly control
the user's private Docker container.
