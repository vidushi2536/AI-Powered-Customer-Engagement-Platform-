export const DATASET_VERSION = 'gurgaon-kaggle-2026-09-06-v1';

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

export type Message = {
  id: string;
  role: 'buyer' | 'agent';
  text: string;
  at: string;
  channel?: 'whatsapp' | 'dashboard';
  blocked?: boolean;
  contactPhone?: string;
};

export type Contact = {
  phone: string;
  name: string;
  consent: 'inbound-only' | 'opted-in' | 'opted-out';
  addedAt: string;
};

export type Requirements = {
  budget?: number;
  bedrooms?: number;
  location?: string;
  timeline?: string;
};

export type LeadStatus =
  | 'New'
  | 'Qualifying'
  | 'Follow up'
  | 'Nurture'
  | 'No match'
  | 'Opted out'
  | 'Viewing proposed';

export type Lead = {
  phone: string;
  name: string;
  status: LeadStatus;
  requirements: Requirements;
  messages: Message[];
  interestedId: string | null;
  meeting: { propertyId: string; date: string; note: string } | null;
  blocked: number;
  updatedAt: string;
};

export type Workspace = {
  ownerPhone?: string | null;
  onboardingComplete?: boolean;
  contacts?: Contact[];
  leads?: Lead[];
  phone: string | null;
  phoneMode: string;
  crm: boolean;
  agentEnabled: boolean;
  requirements: Requirements;
  messages: Message[];
  properties: Property[];
  datasetVersion?: string;
  status: LeadStatus;
  interestedId: string | null;
  meeting: { propertyId: string; date: string; note: string } | null;
  blocked: number;
  updatedAt: string;
  note: string;
  whatsapp?: {
    accountId: string;
    senderPhone: string | null;
    lastEventAt: string | null;
    connected: boolean;
  };
};

export type WhatsAppEvent = {
  id: string;
  direction: 'received' | 'sent';
  text: string;
  at: string;
};

export type PropertyRecommendation = {
  property: Property;
  reasons: string[];
  specificallyMentioned: boolean;
};

export type LeadInsight = {
  phone: string;
  name: string;
  status: LeadStatus;
  readiness: number;
  summary: string;
  nextAction: string;
  missing: string[];
  evidence: Message[];
  lastBuyerMessage: string | null;
  recommendations: PropertyRecommendation[];
  messageCount: number;
  updatedAt: string;
};

export type PropertyTrend = {
  property: Property;
  inquiries: number;
  interestedLeads: number;
  requirementMatches: number;
};

export type WorkspaceInsights = {
  leads: LeadInsight[];
  trends: {
    properties: PropertyTrend[];
    sectors: Array<{ label: string; count: number }>;
    bedrooms: Array<{ label: string; count: number }>;
    budgets: Array<{ label: string; count: number }>;
    directPropertyInquiries: number;
  };
};

export function normalisePhone(phone: string) {
  let value = phone.replace(/[\s()-]/g, '');
  if (/^\d{10}$/.test(value)) value = '+91' + value;
  return value;
}

export function matches(properties: Property[], requirements: Requirements) {
  return properties
    .filter(
      (property) =>
        (!requirements.budget || property.priceLakhs <= requirements.budget) &&
        (!requirements.bedrooms ||
          property.bedrooms === requirements.bedrooms) &&
        (!requirements.location ||
          property.location.toLowerCase() ===
            requirements.location.toLowerCase()),
    )
    .sort((a, b) => a.priceLakhs - b.priceLakhs);
}

const jailbreak =
  /(ignore|disregard|override).{0,50}(instruction|rule|previous|system)|system\s*(prompt|message)|jailbreak|developer\s*mode|\b(shell|bash|powershell|execute|exec|sudo|password|api.?key|token|seashell|poem|recipe|politics|election|bitcoin|hack|malware)\b|<\/?(system|script)|\b(roleplay|pretend)\b|https?:\/\//i;

export function qualify(state: Workspace, message: string): Workspace {
  const next = structuredClone(state);
  const at = new Date().toISOString();
  const reply = (text: string, blocked = false) => {
    next.messages.push({
      id: crypto.randomUUID(),
      role: 'agent',
      text,
      at,
      channel: 'dashboard',
      blocked,
    });
    if (blocked) next.blocked++;
    next.updatedAt = at;
    return next;
  };
  if (!next.crm) throw new Error('Connect the demo CRM first.');
  if (!next.agentEnabled)
    throw new Error('The property agent is paused. Resume it in Agent setup.');
  if (!message.trim() || message.length > 1200)
    throw new Error('Send a message between 1 and 1,200 characters.');
  next.messages.push({
    id: crypto.randomUUID(),
    role: 'buyer',
    text: message,
    at,
    channel: 'dashboard',
  });
  if (next.messages.length > 500)
    throw new Error('This workspace has reached its 500-message limit.');

  if (
    /\b(stop|unsubscribe)\b|do ?n['’]?t (contact|message)|leave me alone|not interested|no more messages/i.test(
      message,
    )
  ) {
    next.status = 'Opted out';
    next.interestedId = null;
    next.meeting = null;
    return reply(
      'Understood. You are opted out and will receive no more property follow-ups. Send START if you choose to resume.',
    );
  }
  if (next.status === 'Opted out') {
    if (message.trim().toLowerCase() !== 'start')
      return reply('You are opted out. Send START only if you want to resume.');
    next.status = 'Qualifying';
    return reply(
      'Welcome back. What budget, bedroom count and Gurugram sector should I search?',
    );
  }
  if (jailbreak.test(message))
    return reply(
      'I can only help with property requirements, listing details and viewing interest. What budget and Gurugram sector should I use?',
      true,
    );

  const requirements = next.requirements;
  let found = false;
  const budget =
    message.match(
      /(?:₹|rs\.?|inr|budget(?:\s+is)?|under|below|up to|upto)\s*([\d,.]+)\s*(lakh|lac|l|crore|cr)?\b/i,
    ) || message.match(/([\d,.]+)\s*(lakhs?|lacs?|crores?|cr)\b/i);
  if (budget) {
    const amount = Number(budget[1].replace(/,/g, ''));
    const unit = (budget[2] || '').toLowerCase();
    const value = unit.startsWith('cr')
      ? amount * 100
      : !unit && amount > 10000
        ? amount / 100000
        : amount;
    if (value > 0 && value <= 100000) {
      requirements.budget = value;
      found = true;
    }
  }
  const beds = message.match(/\b([1-9])\s*(bhk|bedroom|bed)\b/i);
  if (beds) {
    requirements.bedrooms = Number(beds[1]);
    found = true;
  }
  const sector = message.match(/\bsector\s*([0-9]{1,3}[a-z]?)\b/i);
  if (sector) {
    const location = next.properties.find((property) =>
      property.location
        .toLowerCase()
        .startsWith(`sector ${sector[1].toLowerCase()},`),
    )?.location;
    if (location) {
      requirements.location = location;
      found = true;
    }
  } else if (/any (area|location|sector)|anywhere/i.test(message)) {
    delete requirements.location;
    found = true;
  }
  const timeline = message.match(
    /\b(immediately|this month|next month|within \d+ months?|\d+ months?|next year|just browsing|later)\b/i,
  );
  if (timeline) {
    requirements.timeline = timeline[1];
    found = true;
  }

  const currentMatches = matches(next.properties, requirements);
  const selected = message.match(/\b(?:GGN-\d+|CSV-[a-z0-9-]+)\b/i)?.[0];
  const target = selected
    ? next.properties.find(
        (property) => property.id.toLowerCase() === selected.toLowerCase(),
      )
    : undefined;
  if (selected && !target)
    return reply('That listing is not in the current property library.');
  const interest =
    /\b(interested|viewing|visit|schedule|meet|book|see it|see this)\b/i.test(
      message,
    );
  if (target && interest) {
    next.interestedId = target.id;
    next.status = 'Follow up';
    return reply(
      `You are interested in ${target.id}, a ${target.bedrooms} BHK in ${target.location}. Would you like a physical viewing? You may name other listing IDs to visit too, and share your preferred date and time. A human advisor must confirm availability and the appointment.`,
    );
  }
  if (interest) {
    next.status = next.interestedId ? 'Follow up' : 'Qualifying';
    return reply(
      next.interestedId
        ? 'Which shortlisted properties would you like to visit physically, and what date and time works for you? A human advisor will confirm availability and the appointment.'
        : 'Please share one or more listing IDs you would like to visit physically, plus your preferred date and time.',
    );
  }
  if (target)
    return reply(
      `${target.id}: ${target.bedrooms} BHK in ${target.location}, ${target.sqft.toLocaleString('en-IN')} sq ft, ₹${target.priceLakhs} lakh. This is a historical sample; verify live availability.`,
    );
  if (
    !found &&
    !/\b(hi|hello|hey|property|properties|home|house|flat|apartment|buy|looking|help|show|match|thanks|thank you|yes|no|budget|location|sector|details)\b/i.test(
      message,
    )
  )
    return reply(
      'I can only help find Gurugram properties and collect viewing interest. Please share your budget, bedroom count and preferred sector.',
      true,
    );
  if (!requirements.budget || !requirements.bedrooms) {
    next.status = 'Qualifying';
    return reply(
      `${!requirements.budget ? 'What is your maximum budget in INR lakhs? ' : ''}${!requirements.bedrooms ? 'How many bedrooms do you need? ' : ''}You can also share a Gurugram sector and buying timeline.`,
    );
  }
  next.status = currentMatches.length
    ? /browsing|later|next year/.test(requirements.timeline || '')
      ? 'Nurture'
      : next.interestedId
        ? 'Follow up'
        : 'Qualifying'
    : 'No match';
  if (!currentMatches.length)
    return reply(
      'There is no exact match in the current sample. Your advisor can review the inventory gap with you.',
    );
  return reply(
    `I found ${currentMatches.length} matching homes. The lowest-priced sample is ${currentMatches[0].id} in ${currentMatches[0].location} at ₹${currentMatches[0].priceLakhs} lakh. Historical sample only; current price and availability require confirmation.`,
  );
}

export function ingestWhatsApp(
  state: Workspace,
  event: WhatsAppEvent,
  contactPhone = state.phone || '',
): Workspace {
  const next = structuredClone(state);
  const contact = next.contacts?.find((item) => item.phone === contactPhone);
  if (!contact) throw new Error('Contact is not in the CRM allowlist');
  next.leads ||= [];
  let lead = next.leads.find((item) => item.phone === contactPhone);
  if (!lead) {
    lead = {
      phone: contactPhone,
      name: contact.name,
      status: 'New',
      requirements: {},
      messages: [],
      interestedId: null,
      meeting: null,
      blocked: 0,
      updatedAt: event.at,
    };
    next.leads.push(lead);
  }
  if (event.direction === 'received') {
    const leadState: Workspace = {
      ...next,
      requirements: lead.requirements,
      messages: lead.messages,
      status: lead.status,
      interestedId: lead.interestedId,
      meeting: lead.meeting,
      blocked: lead.blocked,
    };
    const derived = qualify(leadState, event.text);
    const actualBuyer = derived.messages[lead.messages.length];
    if (!actualBuyer) throw new Error('Could not record inbound message');
    lead.messages.push({
      ...actualBuyer,
      id: event.id,
      at: event.at,
      channel: 'whatsapp',
      contactPhone,
    });
    lead.requirements = derived.requirements;
    lead.status = derived.status;
    lead.interestedId = derived.interestedId;
    lead.meeting = derived.meeting;
    lead.blocked = derived.blocked;
    if (lead.status === 'Opted out') contact.consent = 'opted-out';
    else if (event.text.trim().toLowerCase() === 'start')
      contact.consent = 'inbound-only';
  } else {
    lead.messages.push({
      id: event.id,
      role: 'agent',
      text: event.text,
      at: event.at,
      channel: 'whatsapp',
      contactPhone,
    });
  }
  lead.updatedAt = event.at;
  next.messages.push(lead.messages[lead.messages.length - 1]);
  next.requirements = lead.requirements;
  next.status = lead.status;
  next.interestedId = lead.interestedId;
  next.meeting = lead.meeting;
  next.blocked = lead.blocked;
  next.whatsapp = {
    accountId: 'shellsworth',
    senderPhone: contactPhone,
    lastEventAt: event.at,
    connected: true,
  };
  next.updatedAt = event.at;
  return next;
}

export function dashboardStats(state: Workspace) {
  const leads = state.leads || [];
  const totalMessages = leads.reduce(
    (sum, lead) => sum + lead.messages.length,
    0,
  );
  const active = leads.filter((lead) => lead.messages.length > 0);
  const followUps = leads.filter((lead) =>
    ['Follow up', 'Viewing proposed'].includes(lead.status),
  );
  const optedOut = leads.filter((lead) => lead.status === 'Opted out');
  const qualified = leads.filter(
    (lead) => lead.requirements.budget && lead.requirements.bedrooms,
  );
  const statusCounts = leads.reduce<Record<string, number>>((counts, lead) => {
    counts[lead.status] = (counts[lead.status] || 0) + 1;
    return counts;
  }, {});
  return {
    contacts: state.contacts?.length || 0,
    catalog: state.properties.length,
    activeLeads: active.length,
    totalMessages,
    followUps: followUps.length,
    optedOut: optedOut.length,
    qualified: qualified.length,
    responseCoverage: state.contacts?.length
      ? Math.round((active.length / state.contacts.length) * 100)
      : 0,
    statusCounts,
    lastActivity:
      leads
        .map((lead) => lead.updatedAt)
        .sort()
        .at(-1) || null,
  };
}

function nextActionFor(lead: Lead) {
  if (lead.status === 'Opted out')
    return 'Do not contact. The buyer opted out.';
  if (lead.status === 'Viewing proposed')
    return 'Buyer ready for a physical meeting. Confirm the properties, availability, time and attendee.';
  if (lead.status === 'Follow up')
    return 'Buyer ready for a physical meeting at the interested properties. Call to confirm availability and book the visit.';
  if (lead.status === 'No match')
    return 'Explain the inventory gap and confirm which requirement can flex.';
  if (lead.status === 'Nurture')
    return 'Follow up closer to the buyer’s stated purchase timeline.';
  return 'Collect the missing requirements before recommending a visit.';
}

function recommendationReasons(
  property: Property,
  lead: Lead,
  specificallyMentioned: boolean,
) {
  const reasons: string[] = [];
  if (specificallyMentioned) reasons.push('Buyer mentioned this listing');
  if (lead.requirements.bedrooms === property.bedrooms)
    reasons.push(`Matches ${property.bedrooms} BHK requirement`);
  if (
    lead.requirements.budget &&
    property.priceLakhs <= lead.requirements.budget
  )
    reasons.push(`Within ₹${lead.requirements.budget} lakh budget`);
  if (
    lead.requirements.location?.toLowerCase() ===
    property.location.toLowerCase()
  )
    reasons.push(`Matches ${lead.requirements.location}`);
  return reasons;
}

export function workspaceInsights(state: Workspace): WorkspaceInsights {
  const leads = (state.leads || [])
    .map((lead): LeadInsight => {
      const buyerMessages = lead.messages.filter(
        (message) => message.role === 'buyer' && !message.blocked,
      );
      const mentionedIds = new Set(
        buyerMessages
          .flatMap(
            (message) =>
              message.text.match(/\b(?:GGN-\d+|CSV-[a-z0-9-]+)\b/gi) || [],
          )
          .map((id) => id.toLowerCase()),
      );
      if (lead.interestedId) mentionedIds.add(lead.interestedId.toLowerCase());
      const shortlist = matches(state.properties, lead.requirements);
      const recommendations = state.properties
        .map((property) => ({
          property,
          specificallyMentioned: mentionedIds.has(property.id.toLowerCase()),
        }))
        .filter(
          ({ property, specificallyMentioned }) =>
            specificallyMentioned ||
            shortlist.some((item) => item.id === property.id),
        )
        .sort(
          (left, right) =>
            Number(right.specificallyMentioned) -
              Number(left.specificallyMentioned) ||
            left.property.priceLakhs - right.property.priceLakhs,
        )
        .slice(0, 4)
        .map(({ property, specificallyMentioned }) => ({
          property,
          specificallyMentioned,
          reasons: recommendationReasons(property, lead, specificallyMentioned),
        }));
      const missing = [
        !lead.requirements.budget ? 'maximum budget' : null,
        !lead.requirements.bedrooms ? 'bedroom count' : null,
        !lead.requirements.location ? 'preferred sector' : null,
        !lead.requirements.timeline ? 'purchase timeline' : null,
      ].filter((value): value is string => Boolean(value));
      const known = 4 - missing.length;
      const readiness = Math.min(
        100,
        known * 15 +
          (buyerMessages.length ? 10 : 0) +
          (lead.interestedId ? 25 : 0) +
          (['Follow up', 'Viewing proposed'].includes(lead.status) ? 5 : 0),
      );
      const summary = [
        lead.requirements.bedrooms ? `${lead.requirements.bedrooms} BHK` : null,
        lead.requirements.budget
          ? `up to ₹${lead.requirements.budget} lakh`
          : null,
        lead.requirements.location || null,
        lead.requirements.timeline || null,
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        phone: lead.phone,
        name: lead.name,
        status: lead.status,
        readiness,
        summary: summary || 'Requirements not yet established',
        nextAction: nextActionFor(lead),
        missing,
        evidence: buyerMessages.slice(-4).reverse(),
        lastBuyerMessage: buyerMessages.at(-1)?.text || null,
        recommendations,
        messageCount: lead.messages.length,
        updatedAt: lead.updatedAt,
      };
    })
    .sort((left, right) => {
      const order: Record<LeadStatus, number> = {
        'Follow up': 0,
        'Viewing proposed': 1,
        Qualifying: 2,
        'No match': 3,
        Nurture: 4,
        New: 5,
        'Opted out': 6,
      };
      return (
        order[left.status] - order[right.status] ||
        right.readiness - left.readiness ||
        right.updatedAt.localeCompare(left.updatedAt)
      );
    });

  const sectorCounts = new Map<string, number>();
  const bedroomCounts = new Map<string, number>();
  const budgetCounts = new Map<string, number>();
  for (const lead of state.leads || []) {
    if (lead.requirements.location)
      sectorCounts.set(
        lead.requirements.location,
        (sectorCounts.get(lead.requirements.location) || 0) + 1,
      );
    if (lead.requirements.bedrooms) {
      const label = `${lead.requirements.bedrooms} BHK`;
      bedroomCounts.set(label, (bedroomCounts.get(label) || 0) + 1);
    }
    if (lead.requirements.budget) {
      const budget = lead.requirements.budget;
      const label =
        budget <= 50
          ? 'Up to ₹50L'
          : budget <= 100
            ? '₹50–100L'
            : budget <= 200
              ? '₹1–2Cr'
              : 'Above ₹2Cr';
      budgetCounts.set(label, (budgetCounts.get(label) || 0) + 1);
    }
  }
  const propertyTrends = state.properties
    .map((property): PropertyTrend => {
      const id = property.id.toLowerCase();
      const society = property.society?.trim().toLowerCase();
      const inquiries = (state.leads || []).reduce(
        (count, lead) =>
          count +
          lead.messages.filter(
            (message) =>
              message.role === 'buyer' &&
              (message.text.toLowerCase().includes(id) ||
                (society &&
                  society.length >= 5 &&
                  message.text.toLowerCase().includes(society))),
          ).length,
        0,
      );
      const interestedLeads = (state.leads || []).filter(
        (lead) => lead.interestedId?.toLowerCase() === id,
      ).length;
      const requirementMatches = (state.leads || []).filter(
        (lead) =>
          Boolean(lead.requirements.budget && lead.requirements.bedrooms) &&
          matches([property], lead.requirements).length === 1,
      ).length;
      return { property, inquiries, interestedLeads, requirementMatches };
    })
    .filter(
      (trend) =>
        trend.inquiries || trend.interestedLeads || trend.requirementMatches,
    )
    .sort(
      (left, right) =>
        right.inquiries - left.inquiries ||
        right.interestedLeads - left.interestedLeads ||
        right.requirementMatches - left.requirementMatches,
    );
  const rankCounts = (counts: Map<string, number>) =>
    [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.label.localeCompare(right.label),
      );
  return {
    leads,
    trends: {
      properties: propertyTrends,
      sectors: rankCounts(sectorCounts),
      bedrooms: rankCounts(bedroomCounts),
      budgets: rankCounts(budgetCounts),
      directPropertyInquiries: propertyTrends.reduce(
        (sum, trend) => sum + trend.inquiries,
        0,
      ),
    },
  };
}

export function brief(state: Workspace) {
  const requirements = [
    state.requirements.bedrooms ? `${state.requirements.bedrooms} BHK` : null,
    state.requirements.budget
      ? `up to ₹${state.requirements.budget} lakh`
      : null,
    state.requirements.location || null,
    state.requirements.timeline || null,
  ]
    .filter(Boolean)
    .join(' · ');
  const action =
    state.status === 'Opted out'
      ? 'Do not contact. Buyer has opted out.'
      : state.status === 'Follow up'
        ? 'Arrange a viewing. The buyer expressed interest in a property.'
        : state.status === 'Viewing proposed'
          ? 'Confirm the proposed viewing with the buyer and property owner.'
          : state.status === 'No match'
            ? 'Review the inventory gap; do not discard the lead automatically.'
            : state.status === 'Nurture'
              ? 'Keep warm and follow up near the buyer’s stated timeline.'
              : 'Gather the missing requirements on WhatsApp.';
  return {
    requirements: requirements || 'Requirements not yet shared',
    action,
    evidence: state.messages
      .filter((message) => message.role === 'buyer')
      .slice(-3),
    matches: matches(state.properties, state.requirements).length,
  };
}
