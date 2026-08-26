CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`user_id` text,
	`before_json` text,
	`after_json` text,
	`message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`address` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`last_synced_at` text,
	`sync_attempts` integer DEFAULT 0 NOT NULL,
	`last_sync_error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_deleted_at_idx` ON `customers` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `customers_sync_status_idx` ON `customers` (`sync_status`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`order_date` text NOT NULL,
	`customer_id` text NOT NULL,
	`customer_name_snapshot` text NOT NULL,
	`item` text NOT NULL,
	`pieces` integer NOT NULL,
	`weight_in` text NOT NULL,
	`weight_out` text NOT NULL,
	`making_charge` text NOT NULL,
	`loss` text NOT NULL,
	`touch` text NOT NULL,
	`fine_total` text NOT NULL,
	`weight_exceeds_confirmed` integer DEFAULT false NOT NULL,
	`notes` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`last_synced_at` text,
	`sync_attempts` integer DEFAULT 0 NOT NULL,
	`last_sync_error` text,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_idx` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_order_date_idx` ON `orders` (`order_date`);--> statement-breakpoint
CREATE INDEX `orders_customer_id_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_deleted_at_idx` ON `orders` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `orders_sync_status_idx` ON `orders` (`sync_status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_queue_status_idx` ON `sync_queue` (`status`);--> statement-breakpoint
CREATE INDEX `sync_queue_entity_idx` ON `sync_queue` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);