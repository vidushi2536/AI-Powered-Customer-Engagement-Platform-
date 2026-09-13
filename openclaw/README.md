# OpenClaw integration

This directory contains only the secret-free parts of the WhatsApp integration:

- `workspace/`: the isolated Estate Desk identity and real-estate task rules;
- `hooks/estate-desk-sync/`: signs and mirrors successful WhatsApp events;
- `plugins/estate-desk-policy/`: blocks unsafe destinations and out-of-scope
  input/output;
- `scripts/sync-openclaw-crm.mjs`: watches a manager workspace and updates the
  WhatsApp contact allowlist, peer routes and property context.

The live OpenClaw configuration, WhatsApp link state, account tokens, personal
numbers and webhook secret are not committed. The runtime needs:

```dotenv
ESTATE_DESK_SYNC_URL=http://host.docker.internal:3000/api/whatsapp/events
ESTATE_DESK_SYNC_SECRET=replace-with-a-long-random-secret
```

Use the same secret in `code/estate-desk/.dev.vars`. Register the
`estate-desk` agent, mount the workspace/hook/policy, and run the CRM watcher for
the correct owner phone. It builds peer-specific WhatsApp routes from the
authorized CRM instead of relying on a hard-coded public number. Keep Telegram
on its own account and agent binding so both channels can run at the same time.

See [`code/estate-desk/OPENCLAW-SETUP.md`](../code/estate-desk/OPENCLAW-SETUP.md)
for the complete event path. OpenClaw command names can change between releases,
so check the installed version before changing the live gateway.
