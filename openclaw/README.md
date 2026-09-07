# OpenClaw integration

This directory contains the version-controlled, secret-free parts of the
WhatsApp integration:

- `workspace/`: the isolated Estate Desk agent identity, task boundary and
  fixed sample-property context;
- `hooks/estate-desk-sync/`: mirrors successful WhatsApp message events into
  the dashboard webhook;
- `plugins/estate-desk-policy/`: applies a second input/output guardrail and a
  fail-closed recipient allowlist.

The live OpenClaw configuration, WhatsApp link state, tokens and webhook secret
are deliberately not committed. Set these values in the private runtime:

```dotenv
ALLOWED_WHATSAPP_PHONE=+919999999999
ESTATE_DESK_SYNC_URL=http://host.docker.internal:3000/api/whatsapp/events
ESTATE_DESK_SYNC_SECRET=replace-with-a-long-random-secret
```

Use the same phone and secret in `code/estate-desk/.dev.vars` (local) or the
hosting environment. Copy or mount the three directories above into the
OpenClaw runtime, register an `estate-desk` agent with no tools, and create a
peer-specific WhatsApp binding for the configured number. Keep any existing
Telegram agent on its own channel/account binding.

See [`code/estate-desk/OPENCLAW-SETUP.md`](../code/estate-desk/OPENCLAW-SETUP.md)
for the event path and validation checklist. OpenClaw command/config syntax can
vary by release, so compare the checked-in examples with the installed release
before changing a live gateway.
