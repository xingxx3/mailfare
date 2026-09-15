import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { assertAdmin } from "@/lib/auth/admin";
import { getAuthorizedSenderAddress } from "@/lib/email/sender";
import { broadcastSchema } from "@/lib/subscribers/schemas";
import { listVerifiedSubscribers, syncSubscriberStatuses } from "@/lib/subscribers/service";

/**
 * Sends a promotional message to every verified subscriber. Each recipient is
 * enqueued on the OUTBOUND_QUEUE, where the Worker's queue consumer runs the
 * normal send pipeline (message record + Cloudflare EMAIL binding).
 */
export async function POST(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	try {
		assertAdmin(user);
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	if (!env.OUTBOUND_QUEUE) {
		return NextResponse.json(
			{ error: "The OUTBOUND_QUEUE binding is not configured on this instance" },
			{ status: 503 },
		);
	}

	let parsed;
	try {
		parsed = broadcastSchema.safeParse(await request.json());
	} catch {
		return NextResponse.json({ error: "Invalid broadcast request" }, { status: 400 });
	}
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	try {
		// Fail fast if the selected From address is not an authorized sender.
		const sender = await getAuthorizedSenderAddress(env, {
			userId: user.id,
			from: parsed.data.from,
			mailboxId: parsed.data.mailboxId,
		});

		// Refresh verification statuses from Cloudflare first, so we only send to
		// people who have actually clicked the verification link.
		await syncSubscriberStatuses(env);
		const recipients = await listVerifiedSubscribers(env);
		if (recipients.length === 0) {
			return NextResponse.json({ error: "No verified subscribers yet. Wait until people click the verification links." }, { status: 400 });
		}

		const payload = {
			userId: user.id,
			from: sender.fromAddr,
			mailboxId: parsed.data.mailboxId,
			subject: parsed.data.subject,
			html: parsed.data.html,
			text: parsed.data.text,
		};

		let queued = 0;
		for (const recipient of recipients) {
			await env.OUTBOUND_QUEUE.send({
				...payload,
				to: recipient.email,
			});
			queued += 1;
		}

		return NextResponse.json({ ok: true, queued, recipients: recipients.length });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Broadcast failed";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}