CREATE TABLE `phone_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
