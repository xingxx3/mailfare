import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getEnv } from "@/lib/cloudflare";
import {
	type InboundQueueMessage,
	processInboundMessage,
	storeRawToR2,
} from "@/lib/email/inbound";
import { resolveInboundAddress } from "@/lib/email/routing";

/**
 * Local inbound mailbox HTTP endpoint.
 *
 * In the self-hosted ($0) deployment, email arrives at a tiny deployed
 * "forwarder" Worker bound to Cloudflare Email Routing. That Worker forwards
 * each raw RFC 822 message here over HTTP. This route mirrors the logic from
 * worker.ts's `email()` handler + the inbound queue consumer, but runs against
 * the locally-emulated D1/R2 bindings in `next dev`.
 */
export async function POST(request: Request) {
	const env = getEnv();

	const secret = env.INBOUND_FORWARD_SECRET?.trim();
	const suppliedSecret = request.headers.get("x-mailflare-secret") ?? "";
	if (secret && suppliedSecret !== secret) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const from = request.headers.get("x-mailflare-from") ?? "";
	const to = request.headers.get("x-mailflare-to") ?? "";
	if (!from || !to) {
		return NextResponse.json(
			{ error: "Missing forwarding headers" },
			{ status: 400 },
		);
	}

	const db = getDb(env);
	const decision = await resolveInboundAddress(db, to);
	if (!decision?.mailbox || decision.action !== "store") {
		return NextResponse.json(
			{ error: "Unknown recipient" },
			{ status: 501 },
		);
	}

	let headers: Record<string, string> = {};
	const encodedHeaders = request.headers.get("x-mailflare-headers");
	if (encodedHeaders) {
		try {
			headers = JSON.parse(atob(encodedHeaders)) as Record<string, string>;
		} catch {
			headers = {};
		}
	}

	const rawR2Key = await storeRawToR2(
		env,
		from,
		to,
		request.body ?? new ReadableStream(),
	);

	const payload: InboundQueueMessage = { from, to, rawR2Key, headers };
	await processInboundMessage(env, payload);

	return NextResponse.json({ ok: true });
}