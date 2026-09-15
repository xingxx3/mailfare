import { z } from "zod";

export const subscribeSchema = z.object({
	email: z.string().email().max(500),
	name: z.string().trim().max(100).optional(),
	turnstileToken: z.string().max(2048).optional(),
});

export const broadcastSchema = z.object({
	mailboxId: z.string().min(1).max(200),
	from: z.string().min(3).max(500),
	subject: z.string().min(1).max(500),
	html: z.string().max(2 * 1024 * 1024).optional(),
	text: z.string().max(2 * 1024 * 1024).optional(),
});