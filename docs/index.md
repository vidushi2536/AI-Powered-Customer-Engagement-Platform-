![Tiet Logo](assets/tiet-logo.svg){ .tiet-logo }

**UCS503: Software Engineering (Project)**  
**TIET Patiala**

# Estate Desk

**Authors:** Aman Kapoor and Vidushi Jain

Estate Desk helps a real-estate manager understand and follow up with buyers who
talk through WhatsApp. The OpenClaw agent asks about budget, bedrooms, preferred
area and buying timeline. It can suggest only properties found in the uploaded
catalog and tries to move an interested buyer toward a physical property visit.

## How it works

1. The manager signs up or logs in with a phone number.
2. The manager uploads an authorized CRM CSV and a property-listing CSV.
3. The local bridge gives OpenClaw the approved numbers and current property
   catalog.
4. An approved buyer messages the linked WhatsApp account.
5. Signed conversation events are stored, summarized and matched with property
   records.
6. The dashboard updates live and tells the manager which buyers need attention,
   which properties to show and who appears ready for a physical meeting.

## Main screens

- **Overview:** live counts, lead stages and quick forms or CSV uploads for new
  clients and properties.
- **Meetings:** meeting-ready buyers with their details, requirements, suitable
  properties and conversation-based reasons.
- **Trends:** the properties, locations and bedroom types that buyers ask about
  most often.

The dashboard is an operations tool, not another chat channel. Buyers keep using
WhatsApp. Unknown contacts are rejected, STOP is respected, duplicate webhook
events are ignored and unrelated prompts are blocked. A human still confirms
every physical meeting and every important property fact.

Read the [implementation status](implementation-status.md), [Aman Kapoor work
journal](journals/AmanKapoor_1024240140/Aman-Kapoor-Work-Journal.md) and repository
README for setup and validation commands.
