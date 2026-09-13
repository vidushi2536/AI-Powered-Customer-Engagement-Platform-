import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  state: text('state').notNull(),
  revision: integer('revision').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});
export const phoneChallenges = sqliteTable('phone_challenges', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expires: integer('expires').notNull(),
  sentAt: integer('sent_at').notNull(),
});
export const phoneOwners = sqliteTable('phone_owners', {
  phone: text('phone').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull(),
});
export const whatsappEvents = sqliteTable('whatsapp_events', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  direction: text('direction').notNull(),
  contactPhone: text('contact_phone').notNull(),
  content: text('content').notNull(),
  occurredAt: text('occurred_at').notNull(),
  createdAt: text('created_at').notNull(),
});
export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const campaignContacts = sqliteTable('campaign_contacts', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  phone: text('phone').notNull(),
  displayName: text('display_name'),
  status: text('status').notNull(),
  // Fail-closed allowlist/consent flags checked immediately before every
  // outbound send - see lib/messaging.ts#assertOutboundMessageAllowed.
  optedOut: integer('opted_out').notNull().default(0),
  agentPaused: integer('agent_paused').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  address: text('address').notNull(),
  location: text('location').notNull(),
  price: real('price').notNull(),
  bedrooms: integer('bedrooms').notNull(),
  sizeSqft: real('size_sqft').notNull(),
  propertyType: text('property_type'),
  isHot: integer('is_hot').notNull().default(0),
  demandScore: real('demand_score').notNull().default(0),
  rawSource: text('raw_source'),
  createdAt: text('created_at').notNull(),
});
export const handoffs = sqliteTable('handoffs', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  phone: text('phone').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  acknowledgedAt: text('acknowledged_at'),
  assignedManagerId: text('assigned_manager_id'),
  managerNotes: text('manager_notes'),
  resolvedAt: text('resolved_at'),
});
// Immutable raw conversation ledger for the campaign pipeline. Never
// updated in place - every inbound/outbound/system event is a new row.
export const campaignMessages = sqliteTable('campaign_messages', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  contactPhone: text('contact_phone').notNull(),
  providerMessageId: text('provider_message_id'),
  direction: text('direction').notNull(), // inbound | outbound | system
  body: text('body').notNull(),
  channel: text('channel').notNull().default('whatsapp'),
  occurredAt: text('occurred_at').notNull(),
  createdAt: text('created_at').notNull(),
  rawPayload: text('raw_payload'),
  deliveryStatus: text('delivery_status'),
  failureReason: text('failure_reason'),
});
// The latest *valid* structured extraction per contact. A failed extraction
// never overwrites a previously valid row (enforced in lib/requirements.ts).
export const campaignRequirements = sqliteTable('campaign_requirements', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  contactPhone: text('contact_phone').notNull(),
  extractionStatus: text('extraction_status').notNull(), // valid | failed
  roomsNeeded: integer('rooms_needed'),
  propertyType: text('property_type'),
  preferredLocations: text('preferred_locations'), // JSON array
  budgetMin: real('budget_min'),
  budgetMax: real('budget_max'),
  currency: text('currency'),
  moveInDate: text('move_in_date'),
  requiredFeatures: text('required_features'), // JSON array
  preferredFeatures: text('preferred_features'), // JSON array
  missingFields: text('missing_fields'), // JSON array
  confidence: text('confidence'), // JSON object
  summary: text('summary'),
  sourceMessageIds: text('source_message_ids'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
// Stored top-five (or fewer) match results, refreshed on each matching run.
export const campaignMatches = sqliteTable('campaign_matches', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  contactPhone: text('contact_phone').notNull(),
  propertyId: text('property_id').notNull(),
  rank: integer('rank').notNull(),
  score: real('score').notNull(),
  isHot: integer('is_hot').notNull().default(0),
  matchReasons: text('match_reasons'), // JSON array
  unmetRequirements: text('unmet_requirements'), // JSON array
  createdAt: text('created_at').notNull(),
});
