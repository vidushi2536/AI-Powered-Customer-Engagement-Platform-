// lib/messaging.ts
//
// Server-side recipient authorization for the multi-campaign pipeline
// (Part 4 of the implementation spec). This is the ONLY place that decides
// whether an outbound message may be sent. Every send path - the OpenClaw
// agent, a manual manager reply, a future scheduler - must call
// `assertOutboundMessageAllowed` before talking to a provider. It never
// trusts agent-generated recipients, frontend authorization claims, or
// prompt instructions; it re-reads the allowlist from D1 on every call and
// fails closed on any ambiguity.

import { normalisePhone } from './domain';

export type OutboundErrorCode =
  | 'INVALID_PHONE_NUMBER'
  | 'CONTACT_NOT_ALLOWED'
  | 'CONTACT_OPTED_OUT'
  | 'CONVERSATION_PAUSED'
  | 'CAMPAIGN_NOT_FOUND';

export class OutboundNotAllowedError extends Error {
  code: OutboundErrorCode;
  constructor(code: OutboundErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'OutboundNotAllowedError';
  }
}

type ContactRow = {
  phone: string;
  status: string;
  opted_out: number;
  agent_paused: number;
};

/**
 * Throws an `OutboundNotAllowedError` unless the recipient is a valid,
 * enabled, non-opted-out contact on this campaign whose conversation is
 * not paused for human handoff or closed. Returns the normalised phone on
 * success so callers use one canonical form downstream.
 */
export async function assertOutboundMessageAllowed({
  db,
  campaignId,
  recipientPhone,
}: {
  db: D1Database;
  campaignId: string;
  recipientPhone: string;
}): Promise<{ phone: string }> {
  const phone = normalisePhone(recipientPhone);
  if (!/^\+\d{8,15}$/.test(phone)) {
    throw new OutboundNotAllowedError(
      'INVALID_PHONE_NUMBER',
      'Recipient is not a valid E.164 phone number.',
    );
  }

  const campaign = await db
    .prepare('SELECT id FROM campaigns WHERE id=?')
    .bind(campaignId)
    .first<{ id: string }>();
  if (!campaign) {
    throw new OutboundNotAllowedError('CAMPAIGN_NOT_FOUND', 'Campaign does not exist.');
  }

  const contact = await db
    .prepare(
      'SELECT phone, status, opted_out, agent_paused FROM campaign_contacts WHERE campaign_id=? AND phone=?',
    )
    .bind(campaignId, phone)
    .first<ContactRow>();
  if (!contact) {
    throw new OutboundNotAllowedError(
      'CONTACT_NOT_ALLOWED',
      'Recipient is not on this campaign\'s allowlist.',
    );
  }
  if (contact.opted_out) {
    throw new OutboundNotAllowedError(
      'CONTACT_OPTED_OUT',
      'Recipient has opted out and must not be contacted.',
    );
  }
  if (contact.agent_paused || contact.status === 'handed_off' || contact.status === 'closed') {
    throw new OutboundNotAllowedError(
      'CONVERSATION_PAUSED',
      'Conversation is paused for human handoff or closed.',
    );
  }

  return { phone };
}

const OPT_OUT_PATTERN =
  /\b(stop|unsubscribe|remove me|do not contact|cancel|no more messages)\b/i;
const OPT_IN_PATTERN = /^start$/i;

export function isOptOutMessage(text: string): boolean {
  return OPT_OUT_PATTERN.test(text);
}

export function isOptInMessage(text: string): boolean {
  return OPT_IN_PATTERN.test(text.trim());
}

// Natural-language equivalents of "let me talk to a person" the agent must
// recognise in addition to an explicit "2" reply to the AI-vs-human prompt.
const HANDOFF_PATTERNS = [
  /\bhuman\b/i,
  /\b(a )?(real )?(person|advisor|agent|someone)\b.*\b(speak|talk|connect|please)\b/i,
  /\b(speak|talk|connect me)\b.*\b(person|advisor|human|someone)\b/i,
  /\bcall me\b/i,
  /^\s*2\s*$/,
];

const CONTINUE_AI_PATTERNS = [/\bcontinue\b.*\bassistant\b/i, /^\s*1\s*$/];

export function isHandoffRequest(text: string): boolean {
  return HANDOFF_PATTERNS.some((pattern) => pattern.test(text));
}

export function isContinueWithAiMessage(text: string): boolean {
  return CONTINUE_AI_PATTERNS.some((pattern) => pattern.test(text));
}
