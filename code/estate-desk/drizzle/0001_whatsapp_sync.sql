CREATE TABLE `phone_owners` (
	`phone` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`direction` text NOT NULL,
	`contact_phone` text NOT NULL,
	`content` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `whatsapp_events_workspace_time_idx` ON `whatsapp_events` (`workspace_id`, `occurred_at`);
