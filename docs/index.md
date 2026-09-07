![Tiet Logo](assets/tiet-logo.svg){ .tiet-logo }

**UCS503: Software Engineering (Project)**  
**TIET Patiala**

# AI-Powered Customer Engagement Platform

**Authors:** Aman Kapoor and Vidushi Jain

Estate Desk is a WhatsApp-first real-estate engagement prototype. It helps an
advisor understand a buyer conversation without turning the dashboard into a
second messaging channel. The AI agent is restricted to property discovery,
catalog facts, requirement gathering and viewing interest.

## Problem and outcome

Property teams can lose context across long messaging threads and spend time on
poorly qualified leads. Estate Desk converts permitted WhatsApp events into a
structured lead record with requirements, matching historical listings,
evidence and a clear next action. Interested buyers are escalated to a human for
viewing coordination; opted-out buyers are marked do-not-contact.

## System boundary

```text
Buyer WhatsApp message
        |
        v
OpenClaw peer binding -> isolated Estate Desk agent -> WhatsApp reply
        |                         |
        +---- signed event hook --+
                                  v
                       D1-backed dashboard API
                                  |
                                  v
                    Advisor summaries and actions
```

The dashboard does not offer buyer chat. The OpenClaw agent has no tools, a
single peer-specific allowlist and a separate output policy. A signed webhook
accepts only the configured account, channel and contact; duplicate event IDs
are ignored.

## Prototype capabilities

- ChatGPT sign-in and per-user workspace.
- Configurable single-contact simulated CRM.
- 3,909-row historical Gurgaon Kaggle CSV and 120-record in-app catalog.
- Lead status, requirements, conversation evidence and recommendation summary.
- Property filtering, CSV import, advisor notes and viewing proposal workflow.
- STOP/START lifecycle and narrow real-estate-only prompt boundary.

## Evidence and limitations

Domain tests cover qualification, matching, consent, prompt rejection and
WhatsApp event handling. TypeScript and production builds are part of the
validation checklist. The listing data is historical test data: prices,
availability, ownership and legal details always require human verification.

Read the [implementation status](implementation-status.md), [Aman Kapoor work
journal](journals/AmanKapoor_1024240140/Aman-Kapoor-Work-Journal.md) and repository
README for setup and validation commands.
