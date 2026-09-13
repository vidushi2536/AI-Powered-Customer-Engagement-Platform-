// lib/domain.ts
//
// RECONSTRUCTED FILE. This module was imported by every API route, the
// dashboard UI and the full domain test suite, but was never committed to
// the repository (verified against the complete git history on every
// branch). The shape below was inferred from those call sites and from
// tests/domain.test.ts, which is treated as the authoritative contract.
//
// Pure, dependency-free state transitions for the single-workspace WhatsApp
// lead-qualification demo. Nothing here talks to D1, WhatsApp, or an LLM -
// that belongs in lib/store.ts and the API routes.

export type Property = {
  id: string;
  location: string;
  society?: string | null;
  bedrooms: number;
  sqft: number;
  bathrooms: number | null;
  balconies: number;
  priceLakhs: number;
  ratePerSqft?: number;
  areaType: string;
  source: string;
  sourceRow?: number;
  availability: string;
  image: string;
};

export type Requirements = {
  bedrooms?: number;
  location?: string;
  budget?: number; // INR lakhs, ceiling
};

export type Message = {
  id: string;
  role: 'buyer' | 'agent';
  text: string;
  at: string;
  channel: 'whatsapp';
};

export type WhatsAppInfo = {
  accountId: string;
  senderPhone: string | null;
  lastEventAt: string | null;
  connected: boolean;
};

export type Meeting = {
  propertyId: string;
  date: string;
  note: string;
};

export type WorkspaceStatus =
  | 'New'
  | 'Qualifying'
  | 'No match'
  | 'Follow up'
  | 'Viewing proposed'
  | 'Opted out';

export type Workspace = {
  phone: string | null;
  phoneMode: 'demo' | 'sms';
  crm: boolean;
  agentEnabled: boolean;
  requirements: Requirements;
  messages: Message[];
  properties: Property[];
  status: WorkspaceStatus;
  interestedId: string | null;
  meeting: Meeting | null;
  blocked: 0 | 1;
  note: string;
  updatedAt: string;
  whatsapp?: WhatsAppInfo;
};

export type BriefEvidence = {
  propertyId: string;
  text: string;
};

export type Brief = {
  status: WorkspaceStatus;
  requirements: string;
  matches: string;
  action: string;
  evidence: BriefEvidence[];
  interestedId: string | null;
  meeting: Meeting | null;
  blocked: 0 | 1;
};

export type WhatsAppEvent = {
  id: string;
  direction: 'received' | 'sent';
  text: string;
  at: string;
};

const MAX_MESSAGE_LENGTH = 1200;

// Prompt-injection / off-topic / secret-extraction heuristics. This is a
// coarse allowlist-adjacent guard for a scoped real-estate assistant, not a
// general-purpose safety classifier.
const BLOCK_PATTERNS: RegExp[] = [
  /ignore\s+(all|any|prior|previous)?\s*instructions/i,
  /system\s*prompt/i,
  /api\s*key/i,
  /<\s*script/i,
  /\bweather\b/i,
  /\bpoem\b/i,
  /\bexecute\b/i,
  /\bbash\b/i,
];

const OPT_OUT_PATTERN =
  /\b(stop|unsubscribe|remove me|do not contact|cancel|no more messages)\b/i;
const OPT_IN_PATTERN = /^start$/i;

function isBlocked(text: string): boolean {
  return BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function isOptOut(text: string): boolean {
  return OPT_OUT_PATTERN.test(text);
}

function isOptIn(text: string): boolean {
  return OPT_IN_PATTERN.test(text.trim());
}

/** Normalises a phone number to a `+`-prefixed digit string (loose E.164). */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return (hasPlus ? '+' : '') + digits;
}

function parseRequirements(text: string): Partial<Requirements> {
  const parsed: Partial<Requirements> = {};

  const bhkMatch = text.match(/(\d+)\s*(?:bhk|bed\s*room|bedroom)/i);
  if (bhkMatch) parsed.bedrooms = Number(bhkMatch[1]);

  const sectorMatch = text.match(/sector\s*(\d+)/i);
  if (sectorMatch) parsed.location = `Sector ${sectorMatch[1]}, Gurugram`;

  const croreMatch = text.match(/(\d+(?:\.\d+)?)\s*crore/i);
  if (croreMatch) {
    parsed.budget = Number(croreMatch[1]) * 100;
  } else {
    const lakhMatch = text.match(/(\d+(?:\.\d+)?)\s*lakh/i);
    if (lakhMatch) parsed.budget = Number(lakhMatch[1]);
  }

  return parsed;
}

function findMentionedPropertyId(
  text: string,
  properties: Property[],
): string | null {
  const candidate = text.match(/[A-Za-z]{2,6}-\d{3,6}/)?.[0];
  if (!candidate) return null;
  const upper = candidate.toUpperCase();
  const found = properties.find((p) => p.id.toUpperCase() === upper);
  return found ? found.id : null;
}

/**
 * Deterministic hard-filter matcher. Never delegates ranking to an LLM.
 * Returns at most five properties, cheapest first.
 */
export function matches(
  properties: Property[],
  requirements: Requirements,
): Property[] {
  return properties
    .filter((property) => {
      if (
        requirements.bedrooms != null &&
        property.bedrooms !== requirements.bedrooms
      )
        return false;
      if (
        requirements.location &&
        property.location.toLowerCase() !== requirements.location.toLowerCase()
      )
        return false;
      if (requirements.budget != null && property.priceLakhs > requirements.budget)
        return false;
      return true;
    })
    .sort((a, b) => a.priceLakhs - b.priceLakhs)
    .slice(0, 5);
}

/** Advances the qualification state machine from a single buyer message. */
export function qualify(state: Workspace, rawText: string): Workspace {
  if (!state.agentEnabled)
    throw new Error('Agent is paused for this workspace.');
  if (!state.crm) throw new Error('CRM is disconnected for this workspace.');

  const text = rawText.trim();
  if (!text) throw new Error('Message cannot be empty.');
  if (text.length > MAX_MESSAGE_LENGTH)
    throw new Error(`Message exceeds ${MAX_MESSAGE_LENGTH} characters.`);

  const updatedAt = new Date().toISOString();

  if (state.status === 'Opted out') {
    if (isOptIn(text)) {
      return { ...state, status: 'Qualifying', blocked: 0, updatedAt };
    }
    // Sticky opt-out: ignore everything except an explicit START.
    return { ...state, updatedAt };
  }

  if (isOptOut(text)) {
    return { ...state, status: 'Opted out', updatedAt };
  }

  if (isBlocked(text)) {
    return { ...state, blocked: 1, updatedAt };
  }

  const parsed = parseRequirements(text);
  const requirements: Requirements = { ...state.requirements, ...parsed };
  const propertyId = findMentionedPropertyId(text, state.properties);

  if (propertyId) {
    return {
      ...state,
      requirements,
      interestedId: propertyId,
      status: 'Follow up',
      blocked: 0,
      updatedAt,
    };
  }

  const found = matches(state.properties, requirements);
  return {
    ...state,
    requirements,
    status: found.length > 0 ? 'Qualifying' : 'No match',
    blocked: 0,
    updatedAt,
  };
}

/**
 * Appends a raw WhatsApp event to the immutable transcript. Inbound (buyer)
 * messages are additionally run through `qualify`; if qualification throws
 * (agent paused, CRM disconnected, blocked content, opted out, malformed
 * input) the raw message is still recorded and the prior qualification
 * state is left untouched.
 */
export function ingestWhatsApp(
  state: Workspace,
  event: WhatsAppEvent,
  allowlistedPhone?: string,
): Workspace {
  const role: Message['role'] = event.direction === 'received' ? 'buyer' : 'agent';
  const message: Message = {
    id: event.id,
    role,
    text: event.text,
    at: event.at,
    channel: 'whatsapp',
  };

  const withMessage: Workspace = {
    ...state,
    messages: [...state.messages, message],
    whatsapp: {
      accountId: state.whatsapp?.accountId || 'shellsworth',
      senderPhone: allowlistedPhone ?? state.whatsapp?.senderPhone ?? null,
      lastEventAt: event.at,
      connected: true,
    },
  };

  if (role !== 'buyer') return withMessage;

  try {
    return qualify(withMessage, event.text);
  } catch {
    return withMessage;
  }
}

function describeRequirements(requirements: Requirements): string {
  const parts: string[] = [];
  if (requirements.bedrooms != null) parts.push(`${requirements.bedrooms} BHK`);
  if (requirements.location) parts.push(`in ${requirements.location}`);
  if (requirements.budget != null) parts.push(`under INR ${requirements.budget}L`);
  return parts.length ? parts.join(' ') : 'No requirements captured yet.';
}

function describeMatchCount(count: number): string {
  if (count === 0) return 'No properties in the catalog meet these requirements yet.';
  if (count === 1) return '1 property matches so far.';
  return `${count} properties match so far.`;
}

function describeNextAction(state: Workspace): string {
  switch (state.status) {
    case 'Opted out':
      return 'Buyer opted out. Do not send further messages until they text START.';
    case 'Follow up':
      return `Buyer asked about ${state.interestedId}. Confirm availability and propose a viewing.`;
    case 'No match':
      return 'No catalog listing fits yet. Consider widening the budget or location.';
    case 'Viewing proposed':
      return 'A viewing has been proposed - confirm the time with the buyer.';
    case 'Qualifying':
      return 'Keep collecting requirements or share the top matches with the buyer.';
    default:
      return "Waiting for the buyer's first WhatsApp message.";
  }
}

/** Manager-facing summary of the current qualification state. */
export function brief(state: Workspace): Brief {
  const matched = matches(state.properties, state.requirements);
  const lastBuyerMessage = [...state.messages].reverse().find((m) => m.role === 'buyer');
  const evidence: BriefEvidence[] = matched.map((property, index) => ({
    propertyId: property.id,
    text:
      index === 0 && lastBuyerMessage
        ? lastBuyerMessage.text
        : `${property.bedrooms} BHK in ${property.location} for INR ${property.priceLakhs}L`,
  }));
  return {
    status: state.status,
    requirements: describeRequirements(state.requirements),
    matches: describeMatchCount(matched.length),
    action: describeNextAction(state),
    evidence,
    interestedId: state.interestedId,
    meeting: state.meeting,
    blocked: state.blocked,
  };
}
