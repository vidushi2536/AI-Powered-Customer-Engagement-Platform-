ALTER TABLE `whatsapp_connections` ADD `runtime_account_id` text;
--> statement-breakpoint
ALTER TABLE `whatsapp_connections` ADD `agent_id` text;
--> statement-breakpoint
ALTER TABLE `whatsapp_connections` ADD `sync_token_hash` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_whatsapp_connections_runtime_account_id`
ON `whatsapp_connections` (`runtime_account_id`)
WHERE `runtime_account_id` IS NOT NULL;
