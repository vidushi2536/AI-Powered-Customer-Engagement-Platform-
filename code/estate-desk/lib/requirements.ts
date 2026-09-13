// lib/requirements.ts
//
// Requirement-extraction agent (Part 7 of the implementation spec).
// Reads raw inbound messages and produces validated structured JSON. Never
// sends customer messages, never modifies raw messages, never recommends
// properties.
//
// This is a deterministic, regex-based extractor rather than an LLM call -
// there is no configured `RequirementExtractionProvider` in this
// environment (no AI provider credentials are wired up). It is written
// behind the same shape an LLM-backed implementation would need to satisfy
// (read messages in, return validated structured JSON with confidence and
// missing fields out) so a real provider can be substituted later without
// changing callers. It never guesses: a field is only populated when the
// conversation text supports it, otherwise it is left null/empty and
// listed in `missingFields`.

export type SourceMessage = {
  id: string;
  direction: 'inbound' | 'outbound' | 'system';
  body: string;
};

export type ExtractedRequirements = {
  roomsNeeded: number | null;
  propertyType: string | null;
  preferredLocations: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  moveInDate: string | null;
  requiredFeatures: string[];
  preferredFeatures: string[];
  missingFields: string[];
  confidence: Record<string, number>;
  summary: string;
  sourceMessageIds: string[];
};

const FEATURE_LABELS: Record<string, string> = {
  parking: 'parking',
  balcony: 'balcony',
  furnished: 'furnished',
  gym: 'gym',
  pool: 'swimming pool',
  'pet[\\s-]?friendly': 'pet-friendly',
};

const REQUIRED_HINTS = /essential|required|must have|need(?:s|ed)?|necessary/i;
const PREFERRED_HINTS = /would be nice|prefer(?:red)?|like to have|ideally|bonus/i;

function parseBudget(text: string): { min: number | null; max: number | null; currency: string | null } {
  const rangeMatch = text.match(
    /between\s*\$?(\d[\d,.]*)\s*(?:and|-|to)\s*\$?(\d[\d,.]*)/i,
  );
  if (rangeMatch) {
    return {
      min: Number(rangeMatch[1].replace(/,/g, '')),
      max: Number(rangeMatch[2].replace(/,/g, '')),
      currency: guessCurrency(text),
    };
  }
  const underMatch = text.match(/under\s*\$?(\d[\d,.]*)\s*(lakh|crore|k)?/i);
  if (underMatch) {
    let value = Number(underMatch[1].replace(/,/g, ''));
    const unit = (underMatch[2] || '').toLowerCase();
    if (unit === 'crore') value *= 100;
    if (unit === 'k') value *= 1000;
    return { min: null, max: value, currency: guessCurrency(text) };
  }
  return { min: null, max: null, currency: null };
}

function guessCurrency(text: string): string | null {
  if (/\$|usd|dollars?/i.test(text)) return 'USD';
  if (/lakh|crore|INR |inr|rupees?/i.test(text)) return 'INR';
  return null;
}

function parseLocations(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /near\s+([A-Za-z][A-Za-z\s]{2,30}?)(?=[.,]|\s+(?:and|or|with|under)\b|$)/gi,
    /close to\s+(?:the\s+)?([A-Za-z][A-Za-z\s]{2,30}?)(?=[.,]|\s+(?:and|or|with|under)\b|$)/gi,
    /\bin\s+([A-Za-z][A-Za-z\s]{2,30}?)(?=[.,]|\s+(?:and|or|with|under)\b|$)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[1].trim();
      if (value && !found.some((v) => v.toLowerCase() === value.toLowerCase())) {
        found.push(value);
      }
    }
  }
  return found;
}

function parseFeatures(text: string): { required: string[]; preferred: string[] } {
  const required: string[] = [];
  const preferred: string[] = [];
  for (const [pattern, label] of Object.entries(FEATURE_LABELS)) {
    const re = new RegExp(pattern, 'i');
    if (!re.test(text)) continue;
    const sentence = text.split(/(?<=[.!?])\s+/).find((s) => re.test(s)) || text;
    if (REQUIRED_HINTS.test(sentence)) required.push(label);
    else if (PREFERRED_HINTS.test(sentence)) preferred.push(label);
    else required.push(label); // stated with no hedge - treat as required
  }
  return { required, preferred };
}

function parseMoveInDate(text: string): string | null {
  const explicit = text.match(/move[-\s]?in\s+(?:by|on|next|in)?\s*([A-Za-z]+\s*\d{0,4}|\d{1,2}\/\d{1,2}\/?\d{0,4})/i);
  if (explicit) return explicit[1].trim();
  const relative = text.match(/\b(next month|this month|next week|immediately|asap)\b/i);
  if (relative) return relative[1];
  return null;
}

function parseRooms(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:bhk|bed\s*rooms?|rooms?)\b/i);
  return match ? Number(match[1]) : null;
}

function parsePropertyType(text: string): string | null {
  if (/\bapartment\b|\bflat\b/i.test(text)) return 'apartment';
  if (/\bvilla\b|\bindependent house\b|\bhouse\b/i.test(text)) return 'house';
  if (/\bstudio\b/i.test(text)) return 'studio';
  if (/\bcondo\b/i.test(text)) return 'condo';
  return null;
}

/**
 * Extracts structured requirements from a conversation's inbound messages.
 * Outbound (agent) and system messages are excluded from parsing but their
 * ids are irrelevant here - only inbound message ids ever appear in
 * `sourceMessageIds`, since only the customer's own words are evidence for
 * their requirements.
 */
export function extractRequirements(messages: SourceMessage[]): ExtractedRequirements {
  const inbound = messages.filter((m) => m.direction === 'inbound');
  const text = inbound.map((m) => m.body).join('\n');
  const confidence: Record<string, number> = {};

  const roomsNeeded = parseRooms(text);
  if (roomsNeeded != null) confidence.roomsNeeded = 0.9;

  const propertyType = parsePropertyType(text);
  if (propertyType) confidence.propertyType = 0.6;

  const budget = parseBudget(text);
  if (budget.max != null) confidence.budgetMax = budget.min != null ? 0.85 : 0.75;
  if (budget.min != null) confidence.budgetMin = 0.85;

  const preferredLocations = parseLocations(text);
  if (preferredLocations.length) confidence.preferredLocations = 0.6;

  const { required: requiredFeatures, preferred: preferredFeatures } = parseFeatures(text);

  const moveInDate = parseMoveInDate(text);
  if (moveInDate) confidence.moveInDate = 0.5;

  const missingFields: string[] = [];
  if (roomsNeeded == null) missingFields.push('rooms_needed');
  if (!preferredLocations.length) missingFields.push('preferred_locations');
  if (budget.max == null) missingFields.push('budget_max');
  if (!moveInDate) missingFields.push('move_in_date');

  const result: ExtractedRequirements = {
    roomsNeeded,
    propertyType,
    preferredLocations,
    budgetMin: budget.min,
    budgetMax: budget.max,
    currency: budget.currency,
    moveInDate,
    requiredFeatures,
    preferredFeatures,
    missingFields,
    confidence,
    summary: '',
    sourceMessageIds: inbound.map((m) => m.id),
  };
  result.summary = summarise(result);
  return result;
}

function summarise(r: ExtractedRequirements): string {
  const parts: string[] = [];
  parts.push(
    r.roomsNeeded
      ? `Customer is looking for a ${r.roomsNeeded}-bedroom ${r.propertyType || 'property'}`
      : 'Customer has not yet specified a bedroom count',
  );
  if (r.preferredLocations.length) parts.push(`near ${r.preferredLocations.join(' or ')}`);
  if (r.budgetMax != null) {
    const currency = r.currency ? `${r.currency} ` : '';
    parts.push(
      r.budgetMin != null
        ? `with a budget of ${currency}${r.budgetMin}\u2013${r.budgetMax}`
        : `with a maximum budget of ${currency}${r.budgetMax}`,
    );
  }
  if (r.requiredFeatures.length) parts.push(`Required: ${r.requiredFeatures.join(', ')}`);
  if (r.preferredFeatures.length) parts.push(`Preferred: ${r.preferredFeatures.join(', ')}`);
  if (r.moveInDate) parts.push(`Move-in: ${r.moveInDate}`);
  if (r.missingFields.length) parts.push(`Still missing: ${r.missingFields.join(', ')}`);
  return parts.join('. ') + '.';
}

/**
 * A conservative usability gate: don't overwrite a previously valid
 * extraction with one that carries no concrete signal at all (e.g. a
 * single "hi" message). Matching Part 7's "failed extraction never
 * destroys valid data" rule.
 */
export function isExtractionUsable(r: ExtractedRequirements): boolean {
  return (
    r.roomsNeeded != null ||
    r.budgetMax != null ||
    r.preferredLocations.length > 0 ||
    r.requiredFeatures.length > 0
  );
}
