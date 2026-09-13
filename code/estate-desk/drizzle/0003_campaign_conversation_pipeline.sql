CREATE TABLE `campaign_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`contact_phone` text NOT NULL,
	`property_id` text NOT NULL,
	`rank` integer NOT NULL,
	`score` real NOT NULL,
	`is_hot` integer DEFAULT 0 NOT NULL,
	`match_reasons` text,
	`unmet_requirements` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaign_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`contact_phone` text NOT NULL,
	`provider_message_id` text,
	`direction` text NOT NULL,
	`body` text NOT NULL,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	`raw_payload` text
);
--> statement-breakpoint
CREATE TABLE `campaign_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`contact_phone` text NOT NULL,
	`extraction_status` text NOT NULL,
	`rooms_needed` integer,
	`property_type` text,
	`preferred_locations` text,
	`budget_min` real,
	`budget_max` real,
	`currency` text,
	`move_in_date` text,
	`required_features` text,
	`preferred_features` text,
	`missing_fields` text,
	`confidence` text,
	`summary` text,
	`source_message_ids` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `campaign_contacts` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `campaign_contacts` ADD `opted_out` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaign_contacts` ADD `agent_paused` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `handoffs` ADD `assigned_manager_id` text;--> statement-breakpoint
ALTER TABLE `handoffs` ADD `manager_notes` text;--> statement-breakpoint
ALTER TABLE `handoffs` ADD `resolved_at` text;--> statement-breakpoint
-- Idempotent ingestion: the same provider event can never be stored twice
-- for a campaign. SQLite treats distinct NULLs as non-equal, so `system`
-- messages (no provider id) are unaffected.
CREATE UNIQUE INDEX `campaign_messages_provider_id` ON `campaign_messages` (`campaign_id`,`provider_message_id`);--> statement-breakpoint
CREATE INDEX `campaign_messages_contact` ON `campaign_messages` (`campaign_id`,`contact_phone`,`occurred_at`);--> statement-breakpoint
-- One current structured-requirements row per contact; extraction runs
-- upsert this row only when the new extraction is valid.
CREATE UNIQUE INDEX `campaign_requirements_contact` ON `campaign_requirements` (`campaign_id`,`contact_phone`);--> statement-breakpoint
CREATE INDEX `campaign_matches_contact` ON `campaign_matches` (`campaign_id`,`contact_phone`,`rank`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_contacts_campaign_phone` ON `campaign_contacts` (`campaign_id`,`phone`);