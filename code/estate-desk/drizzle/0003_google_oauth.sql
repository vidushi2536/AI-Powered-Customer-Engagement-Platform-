CREATE TABLE `oauth_identities` (
	`provider` text NOT NULL,
	`subject` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_identities_workspace_idx` ON `oauth_identities` (`workspace_id`);
