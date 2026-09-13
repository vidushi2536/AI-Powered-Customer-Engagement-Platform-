CREATE TABLE `app_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`expires` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_contacts` (
	`phone` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`consent` text DEFAULT 'inbound-only' NOT NULL,
	`created_at` text NOT NULL
);
