import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
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
export const whatsappEvents = sqliteTable(
  'whatsapp_events',
  {
    id: text('id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    direction: text('direction').notNull(),
    contactPhone: text('contact_phone').notNull(),
    content: text('content').notNull(),
    occurredAt: text('occurred_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index('whatsapp_events_workspace_time_idx').on(
      table.workspaceId,
      table.occurredAt,
    ),
  ],
);
export const appSessions = sqliteTable('app_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  expires: integer('expires').notNull(),
  createdAt: text('created_at').notNull(),
});
export const oauthIdentities = sqliteTable('oauth_identities', {
  provider: text('provider').notNull(),
  subject: text('subject').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const whatsappConnections = sqliteTable('whatsapp_connections', {
  workspaceId: text('workspace_id').primaryKey(),
  provider: text('provider').notNull(),
  status: text('status').notNull(),
  displayPhone: text('display_phone'),
  runtimeAccountId: text('runtime_account_id'),
  agentId: text('agent_id'),
  syncTokenHash: text('sync_token_hash'),
  wabaId: text('waba_id'),
  phoneNumberId: text('phone_number_id'),
  accessToken: text('access_token'),
  tokenIv: text('token_iv'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const workspaceContacts = sqliteTable(
  'workspace_contacts',
  {
    phone: text('phone').notNull(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull().default(''),
    consent: text('consent').notNull().default('inbound-only'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.phone] }),
    index('workspace_contacts_workspace_idx').on(table.workspaceId),
  ],
);
