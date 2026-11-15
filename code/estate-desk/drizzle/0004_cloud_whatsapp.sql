CREATE TABLE `whatsapp_connections` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`display_phone` text,
	`waba_id` text,
	`phone_number_id` text,
	`access_token` text,
	`token_iv` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_connections_phone_number_id`
ON `whatsapp_connections` (`phone_number_id`)
WHERE `phone_number_id` IS NOT NULL;
