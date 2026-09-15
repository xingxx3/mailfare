CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`destination_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`verified_at` integer,
	`unsubscribed` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'public' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_unique` ON `subscribers` (`email`);
--> statement-breakpoint
CREATE INDEX `subscribers_status_idx` ON `subscribers` (`status`);
--> statement-breakpoint
CREATE INDEX `subscribers_created_idx` ON `subscribers` (`created_at`);