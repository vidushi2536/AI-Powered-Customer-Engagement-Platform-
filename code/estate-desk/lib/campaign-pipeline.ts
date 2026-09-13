// lib/campaign-pipeline.ts
//
// Wires together the immutable raw-message ledger (Part 5), opt-out
// handling (Part 17), human handoff (Part 11), requirement extraction
// (Part 7) and deterministic matching (Part 8) for the multi-campaign
// pipeline. Route handlers stay thin; all the D1 work and idempotency
// rules live here so they're identical regardless of which route triggers
// them (webhook, manual manager action, future scheduler).

import { normalisePhone } from './domain';
import {
  assertOutboundMessageAllowed,
  isHandoffRequest,
  isOptInMessage,
  isOptOutMessage,
} from './messaging';
import { extractRequirements, isExtractionUsable, type SourceMessage } from './requirements';
import { matchProperties, type CampaignProperty } from './matching';

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

type ContactRow = {
  id: string;
  status: string;
  opted_out: number;
  agent_paused: number;
};

async function getContact(
  db: D1Database,
  campaignId: string,
  phone: string,
): Promise<ContactRow | null> {
  return db
    .prepare(
      'SELECT id, status, opted_out, agent_paused FROM campaign_contacts WHERE campaign_id=? AND phone=?',
    )
    .bind(campaignId, phone)
    .first<ContactRow>();
}

async function findDuplicateMessage(
  db: D1Database,
  campaignId: string,
  providerMessageId: string | null,
): Promise<boolean> {
  if (!providerMessageId) return false;
  const row = await db
    .prepare('SELECT id FROM campaign_messages WHERE campaign_id=? AND provider_message_id=?')
    .bind(campaignId, providerMessageId)
    .first<{ id: string }>();
  return !!row;
}

async function insertMessage(
  db: D1Database,
  args: {
    campaignId: string;
    phone: string;
    direction: 'inbound' | 'outbound' | 'system';
    body: string;
    providerMessageId: string | null;
    occurredAt: string;
    rawPayload: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      'INSERT INTO campaign_messages (id, campaign_id, contact_phone, provider_message_id, direction, body, channel, occurred_at, created_at, raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      newId('msg'),
      args.campaignId,
      args.phone,
      args.providerMessageId,
      args.direction,
      args.body,
      'whatsapp',
      args.occurredAt,
      now,
      args.rawPayload,
    )
    .run();
}

async function loadTranscript(
  db: D1Database,
  campaignId: string,
  phone: string,
): Promise<SourceMessage[]> {
  const { results } = await db
    .prepare(
      'SELECT id, direction, body FROM campaign_messages WHERE campaign_id=? AND contact_phone=? ORDER BY occurred_at ASC, created_at ASC',
    )
    .bind(campaignId, phone)
    .all<{ id: string; direction: string; body: string }>();
  return results.map((r) => ({
    id: r.id,
    direction: r.direction as SourceMessage['direction'],
    body: r.body,
  }));
}

async function runExtractionAndMatching(
  db: D1Database,
  campaignId: string,
  phone: string,
): Promise<{ requirementsReady: boolean; matchCount: number }> {
  const transcript = await loadTranscript(db, campaignId, phone);
  const extracted = extractRequirements(transcript);
  const now = new Date().toISOString();

  if (isExtractionUsable(extracted)) {
    // Only a *valid* extraction ever overwrites the current requirements
    // row - an unusable extraction leaves prior valid data untouched.
    await db
      .prepare(
        `INSERT INTO campaign_requirements
          (id, campaign_id, contact_phone, extraction_status, rooms_needed, property_type, preferred_locations, budget_min, budget_max, currency, move_in_date, required_features, preferred_features, missing_fields, confidence, summary, source_message_ids, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(campaign_id, contact_phone) DO UPDATE SET
           extraction_status=excluded.extraction_status,
           rooms_needed=excluded.rooms_needed,
           property_type=excluded.property_type,
           preferred_locations=excluded.preferred_locations,
           budget_min=excluded.budget_min,
           budget_max=excluded.budget_max,
           currency=excluded.currency,
           move_in_date=excluded.move_in_date,
           required_features=excluded.required_features,
           preferred_features=excluded.preferred_features,
           missing_fields=excluded.missing_fields,
           confidence=excluded.confidence,
           summary=excluded.summary,
           source_message_ids=excluded.source_message_ids,
           updated_at=excluded.updated_at`,
      )
      .bind(
        newId('req'),
        campaignId,
        phone,
        'valid',
        extracted.roomsNeeded,
        extracted.propertyType,
        JSON.stringify(extracted.preferredLocations),
        extracted.budgetMin,
        extracted.budgetMax,
        extracted.currency,
        extracted.moveInDate,
        JSON.stringify(extracted.requiredFeatures),
        JSON.stringify(extracted.preferredFeatures),
        JSON.stringify(extracted.missingFields),
        JSON.stringify(extracted.confidence),
        extracted.summary,
        JSON.stringify(extracted.sourceMessageIds),
        now,
        now,
      )
      .run();

    const { results: propertyRows } = await db
      .prepare(
        'SELECT id, address, location, price, bedrooms, size_sqft as sizeSqft, property_type as propertyType, is_hot as isHot, demand_score as demandScore FROM properties WHERE campaign_id=?',
      )
      .bind(campaignId)
      .all<CampaignProperty>();

    const matches = matchProperties(extracted, propertyRows);

    await db.prepare('DELETE FROM campaign_matches WHERE campaign_id=? AND contact_phone=?').bind(campaignId, phone).run();
    if (matches.length) {
      await db.batch(
        matches.map((m) =>
          db
            .prepare(
              'INSERT INTO campaign_matches (id, campaign_id, contact_phone, property_id, rank, score, is_hot, match_reasons, unmet_requirements, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            )
            .bind(
              newId('match'),
              campaignId,
              phone,
              m.propertyId,
              m.rank,
              m.score,
              m.isHot ? 1 : 0,
              JSON.stringify(m.matchReasons),
              JSON.stringify(m.unmetRequirements),
              now,
            ),
        ),
      );
    }
    return { requirementsReady: true, matchCount: matches.length };
  }

  return { requirementsReady: false, matchCount: 0 };
}

async function createHandoff(
  db: D1Database,
  campaignId: string,
  phone: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare('UPDATE campaign_contacts SET status=?, agent_paused=1, updated_at=? WHERE campaign_id=? AND phone=?')
      .bind('handed_off', now, campaignId, phone),
    db
      .prepare(
        'INSERT INTO handoffs (id, campaign_id, phone, reason, status, created_at, acknowledged_at) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(newId('handoff'), campaignId, phone, reason.slice(0, 500), 'pending', now, null),
  ]);
}

export type InboundResult = {
  duplicate: boolean;
  optedOut: boolean;
  handoffRequested: boolean;
  requirementsReady: boolean;
  matchCount: number;
};

/**
 * Idempotently records an inbound customer message and advances the
 * conversation: opt-out/opt-in take priority, then an explicit handoff
 * request pauses the agent, otherwise requirements are (re-)extracted and
 * matched. The raw message is stored exactly once regardless of outcome.
 */
export async function recordInboundMessage(
  db: D1Database,
  args: {
    campaignId: string;
    phone: string;
    body: string;
    providerMessageId?: string | null;
    occurredAt?: string;
    rawPayload?: string | null;
  },
): Promise<InboundResult> {
  const phone = normalisePhone(args.phone);
  const contact = await getContact(db, args.campaignId, phone);
  if (!contact) {
    throw new Error('CONTACT_NOT_ALLOWED');
  }

  if (await findDuplicateMessage(db, args.campaignId, args.providerMessageId ?? null)) {
    return {
      duplicate: true,
      optedOut: !!contact.opted_out,
      handoffRequested: contact.status === 'handed_off',
      requirementsReady: false,
      matchCount: 0,
    };
  }

  const occurredAt = args.occurredAt ?? new Date().toISOString();
  await insertMessage(db, {
    campaignId: args.campaignId,
    phone,
    direction: 'inbound',
    body: args.body,
    providerMessageId: args.providerMessageId ?? null,
    occurredAt,
    rawPayload: args.rawPayload ?? null,
  });

  const now = new Date().toISOString();

  if (isOptOutMessage(args.body)) {
    await db
      .prepare('UPDATE campaign_contacts SET opted_out=1, status=?, updated_at=? WHERE campaign_id=? AND phone=?')
      .bind('opted_out', now, args.campaignId, phone)
      .run();
    return { duplicate: false, optedOut: true, handoffRequested: false, requirementsReady: false, matchCount: 0 };
  }

  if (contact.opted_out) {
    if (isOptInMessage(args.body)) {
      await db
        .prepare('UPDATE campaign_contacts SET opted_out=0, status=?, updated_at=? WHERE campaign_id=? AND phone=?')
        .bind('pending', now, args.campaignId, phone)
        .run();
    }
    // Sticky opt-out: no extraction/matching/handoff runs on this message.
    return { duplicate: false, optedOut: !isOptInMessage(args.body), handoffRequested: false, requirementsReady: false, matchCount: 0 };
  }

  if (contact.agent_paused || contact.status === 'handed_off') {
    // Paused for a human - store the message (already done above) but do
    // not run automated extraction/matching/replies. Only an explicit
    // manager resume-agent action clears this.
    return { duplicate: false, optedOut: false, handoffRequested: true, requirementsReady: false, matchCount: 0 };
  }

  if (isHandoffRequest(args.body)) {
    await createHandoff(db, args.campaignId, phone, 'Customer asked to speak with a human advisor.');
    const { requirementsReady, matchCount } = await runExtractionAndMatching(db, args.campaignId, phone);
    return { duplicate: false, optedOut: false, handoffRequested: true, requirementsReady, matchCount };
  }

  const { requirementsReady, matchCount } = await runExtractionAndMatching(db, args.campaignId, phone);
  return { duplicate: false, optedOut: false, handoffRequested: false, requirementsReady, matchCount };
}

/**
 * Records an outbound message after re-validating recipient authorization
 * server-side (see lib/messaging.ts). Throws `OutboundNotAllowedError` if
 * disallowed - callers must not send through a provider first and record
 * second.
 */
export async function recordOutboundMessage(
  db: D1Database,
  args: {
    campaignId: string;
    phone: string;
    body: string;
    providerMessageId?: string | null;
    occurredAt?: string;
    rawPayload?: string | null;
  },
): Promise<{ duplicate: boolean; phone: string }> {
  const { phone } = await assertOutboundMessageAllowed({
    db,
    campaignId: args.campaignId,
    recipientPhone: args.phone,
  });

  if (await findDuplicateMessage(db, args.campaignId, args.providerMessageId ?? null)) {
    return { duplicate: true, phone };
  }

  const occurredAt = args.occurredAt ?? new Date().toISOString();
  await insertMessage(db, {
    campaignId: args.campaignId,
    phone,
    direction: 'outbound',
    body: args.body,
    providerMessageId: args.providerMessageId ?? null,
    occurredAt,
    rawPayload: args.rawPayload ?? null,
  });

  await db
    .prepare('UPDATE campaign_contacts SET status=?, updated_at=? WHERE campaign_id=? AND phone=?')
    .bind('active', new Date().toISOString(), args.campaignId, phone)
    .run();

  return { duplicate: false, phone };
}
