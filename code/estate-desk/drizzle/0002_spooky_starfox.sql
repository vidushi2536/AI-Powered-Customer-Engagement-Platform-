CREATE TABLE `campaign_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`phone` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`phone` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`acknowledged_at` text
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`address` text NOT NULL,
	`location` text NOT NULL,
	`price` real NOT NULL,
	`bedrooms` integer NOT NULL,
	`size_sqft` real NOT NULL,
	`property_type` text,
	`is_hot` integer DEFAULT 0 NOT NULL,
	`demand_score` real DEFAULT 0 NOT NULL,
	`raw_source` text,
	`created_at` text NOT NULL
);
