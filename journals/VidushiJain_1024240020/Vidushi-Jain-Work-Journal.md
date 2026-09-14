# Vidushi Jain - Campaign pipeline work journal

**Date:** 12-13 September 2026

**Project:** AI-Powered Customer Engagement Platform

## My contribution

My contribution in this iteration covered both the system design
documentation and the multi-campaign conversation pipeline: the allowlisted
contact model, conversation handling, property matching, and the
human-handoff workflow, along with the manager-facing dashboard screen.

## Work completed

- Designed and created the ER diagram for the platform's data model.
- Designed and created the activity diagram for the conversation flow.
- Designed and created the IR diagram.
- Designed and created the use case diagram.
- Built the multi-campaign contact allowlist and outbound messaging
  safety checks.
- Implemented storage for WhatsApp conversation messages.
- Added automatic requirement extraction from buyer conversations.
- Implemented property matching against campaign listings.
- Built the human handoff workflow and manager resume control.
- Added manager authentication and access control for the campaign routes.
- Built the campaign management section of the dashboard.
- Added the database migrations needed for the above.
- Wrote automated tests covering the new functionality.
- Helped wire up the WhatsApp integration for the campaign pipeline.
- Resolved various build and deployment issues along the way.

## Result

The campaign track now works as a connected pipeline end to end, backed by
the system design diagrams above, with the relevant functionality covered
by automated tests. Remaining work includes a full production WhatsApp
integration, additional dashboard forms, and further review of the
underlying modules.
