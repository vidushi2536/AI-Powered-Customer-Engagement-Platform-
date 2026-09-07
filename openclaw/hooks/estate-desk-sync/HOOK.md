---
name: estate-desk-sync
description: "Mirror the allowlisted Estate Desk WhatsApp conversation to the local dashboard"
metadata:
  { "openclaw": { "emoji": "🏠", "events": ["message:received", "message:sent"], "requires": { "env": ["ESTATE_DESK_SYNC_URL", "ESTATE_DESK_SYNC_SECRET"] } } }
---

# Estate Desk sync

Posts only the allowlisted WhatsApp direct-chat text to the Estate Desk server.
The receiver validates the shared secret, account, phone, event ID, and size.
