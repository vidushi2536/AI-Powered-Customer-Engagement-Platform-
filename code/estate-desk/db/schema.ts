import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
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
