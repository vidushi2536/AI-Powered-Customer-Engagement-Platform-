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
  status: text('status').notNull(),
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
});
