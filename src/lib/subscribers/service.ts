import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscribers } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
	createDestinationAddress,
	deleteDestinationAddress,
	listDestinationAddresses,
	type CfDestinationAddress,
} from "@/lib/cloudflare-api";
import { normalizeEmailAddress } from "@/lib/email/address";

export type SubscriberStatus = "pending" | "verified";

export type SubscriberRow = typeof subscribers.$inferSelect;

export type SubscribeInput = {
	email: string;
	name?: string | null;
	source?: string;
};

/**
 * Registers an email address as a Cloudflare Email Routing destination.
 * Cloudflare immediately emails the address a verification link. Once the owner
 * clicks it, Cloudflare marks the address verified and the app can send to it.
 */
async function createOrGetDestination(env: CloudflareEnv, email: string): Promise<CfDestinationAddress> {
	try {
		return await createDestinationAddress(env, email);
	} catch (error) {
		// The destination may already exist at the account level — reuse it.
		const addresses = await listDestinationAddresses(env);
		const existing = addresses.find((address) => address.email.toLowerCase() === email.toLowerCase());
		if (existing) return existing;
		throw error;
	}
}

export async function subscribe(env: CloudflareEnv, input: SubscribeInput): Promise<SubscriberRow> {
	const email = normalizeEmailAddress(input.email);
	if (!email) throw new Error("A valid email address is required");
	const db = getDb(env);

	const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1);

	if (existing) {
		if (existing.status === "verified" && !existing.unsubscribed) {
			return existing;
		}

		// Pending, or re-subscribing after unsubscribing: (re)trigger verification.
		if (existing.destinationId) {
			try {
				await deleteDestinationAddress(env, existing.destinationId);
			} catch {
				// Best effort — the address may already be gone.
			}
		}
		const destination = await createOrGetDestination(env, email);
		const verified = destination.status === "verified";
		await db
			.update(subscribers)
			.set({
				destinationId: destination.id,
				status: verified ? "verified" : "pending",
				verifiedAt: verified ? new Date() : null,
				unsubscribed: false,
			})
			.where(eq(subscribers.id, existing.id));

		const [updated] = await db.select().from(subscribers).where(eq(subscribers.id, existing.id)).limit(1);
		return updated!;
	}

	const destination = await createOrGetDestination(env, email);
	const verified = destination.status === "verified";
	const id = newId("sub");
	await db.insert(subscribers).values({
		id,
		email,
		name: input.name?.trim() || null,
		source: input.source ?? "public",
		destinationId: destination.id,
		status: verified ? "verified" : "pending",
		verifiedAt: verified ? new Date() : null,
	});

	const [created] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
	return created!;
}

export async function listSubscribers(env: CloudflareEnv): Promise<SubscriberRow[]> {
	const db = getDb(env);
	return db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
}

export async function listVerifiedSubscribers(env: CloudflareEnv): Promise<SubscriberRow[]> {
	const db = getDb(env);
	return db
		.select()
		.from(subscribers)
		.where(and(eq(subscribers.status, "verified"), eq(subscribers.unsubscribed, false)));
}

/**
 * Re-reads destination statuses from Cloudflare so locally stored subscribers
 * reflect clicks on the verification links Cloudflare sent.
 */
export async function syncSubscriberStatuses(env: CloudflareEnv): Promise<{ updated: number }> {
	const db = getDb(env);
	const [addresses, rows] = await Promise.all([listDestinationAddresses(env), db.select().from(subscribers)]);

	let updated = 0;
	for (const row of rows) {
		const address = addresses.find((candidate) => candidate.email.toLowerCase() === row.email.toLowerCase());
		const verified = address?.status === "verified";
		const patch: {
			destinationId?: string;
			status?: string;
			verifiedAt?: Date | null;
		} = {};
		if (address && address.id !== row.destinationId) patch.destinationId = address.id;
		if (row.status !== (verified ? "verified" : "pending")) patch.status = verified ? "verified" : "pending";
		if (verified && !row.verifiedAt) patch.verifiedAt = new Date();
		if (Object.keys(patch).length > 0) {
			await db.update(subscribers).set(patch).where(eq(subscribers.id, row.id));
			updated += 1;
		}
	}
	return { updated };
}

export async function deleteSubscriber(env: CloudflareEnv, id: string): Promise<SubscriberRow> {
	const db = getDb(env);
	const [row] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
	if (!row) throw new Error("Subscriber not found");

	if (row.destinationId) {
		try {
			await deleteDestinationAddress(env, row.destinationId);
		} catch {
			// Best effort — deleting the local row is the important part.
		}
	}
	await db.delete(subscribers).where(eq(subscribers.id, id));
	return row;
}

/**
 * Cloudflare has no "resend verification" API for destination addresses, so the
 * pending destination is removed and re-created, which triggers a fresh
 * verification email with a new link.
 */
export async function resendSubscriberVerification(env: CloudflareEnv, id: string): Promise<SubscriberRow> {
	const db = getDb(env);
	const [row] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
	if (!row) throw new Error("Subscriber not found");
	if (row.status === "verified") throw new Error("This subscriber is already verified");

	// Remove the old (pending) destination so Cloudflare sends a brand-new
	// verification email with a fresh link on re-creation.
	if (row.destinationId) {
		try {
			await deleteDestinationAddress(env, row.destinationId);
		} catch {
			// Best effort — the delete may already have happened.
		}
	}
	const destination = await createOrGetDestination(env, row.email);
	await db
		.update(subscribers)
		.set({ destinationId: destination.id, status: destination.status === "verified" ? "verified" : "pending" })
		.where(eq(subscribers.id, id));

	const [updated] = await db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
	return updated!;
}