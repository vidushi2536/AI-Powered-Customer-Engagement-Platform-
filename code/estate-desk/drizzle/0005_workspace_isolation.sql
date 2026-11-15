CREATE TABLE `workspace_contacts_isolated` (
	`phone` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`consent` text DEFAULT 'inbound-only' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `phone`)
);
--> statement-breakpoint
INSERT INTO `workspace_contacts_isolated` (`phone`,`workspace_id`,`name`,`consent`,`created_at`)
SELECT `phone`,`workspace_id`,`name`,`consent`,`created_at` FROM `workspace_contacts`;
--> statement-breakpoint
DROP TABLE `workspace_contacts`;
--> statement-breakpoint
ALTER TABLE `workspace_contacts_isolated` RENAME TO `workspace_contacts`;
--> statement-breakpoint
CREATE INDEX `workspace_contacts_workspace_idx` ON `workspace_contacts` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `whatsapp_events_isolated` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`direction` text NOT NULL,
	`contact_phone` text NOT NULL,
	`content` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `whatsapp_events_isolated` (`id`,`workspace_id`,`direction`,`contact_phone`,`content`,`occurred_at`,`created_at`)
SELECT `id`,`workspace_id`,`direction`,`contact_phone`,`content`,`occurred_at`,`created_at` FROM `whatsapp_events`;
--> statement-breakpoint
DROP TABLE `whatsapp_events`;
--> statement-breakpoint
ALTER TABLE `whatsapp_events_isolated` RENAME TO `whatsapp_events`;
--> statement-breakpoint
CREATE INDEX `whatsapp_events_workspace_time_idx` ON `whatsapp_events` (`workspace_id`,`occurred_at`);
