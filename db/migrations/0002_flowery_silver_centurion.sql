ALTER TABLE `orders` ADD `weight_in_2` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `weight_out_2` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `pieces_2` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `cleared_amount` text DEFAULT '0.000' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `clear_status` text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `cleared_at` text;