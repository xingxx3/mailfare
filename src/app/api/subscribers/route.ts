import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { assertAdmin } from "@/lib/auth/admin";
import { verifyTurnstileToken } from "@/lib/auth/turnstile";
import { listSubscribers, subscribe } from "@/lib/subscribers/service";
import { subscribeSchema } from "@/lib/subscribers/schemas";

export async function GET(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	try {
		assertAdmin(user);
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		const rows = await listSubscribers(env);
		return NextResponse.json({ subscribers: listSubscribersForResponse(rows) });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to list subscribers";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

/**
 * Public endpoint — visitors enter their email on the signup form, Cloudflare
 * emails them a verification link, and once clicked they are sendable.
 */
export async function POST(request: Request) {
	const env = getEnv();
	if (!env.CF_AID?.trim()) {
		return NextResponse.json(
			{ error: "Newsletter signup is not configured on this instance (CF_AID is missing)" },
			{ status: 503 },
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid subscription request" }, { status: 400 });
	}
	const parsed = subscribeSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}
	if (!(await verifyTurnstileToken(env, request, parsed.data.turnstileToken))) {
		return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 400 });
	}

	try {
		const subscriber = await subscribe(env, {
			email: parsed.data.email,
			name: parsed.data.name,
			source: "public",
		});
		return NextResponse.json({ subscriber });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to subscribe";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

function listSubscribersForResponse(rows: Awaited<ReturnType<typeof listSubscribers>>) {
	return rows.map(({ destinationId: _destinationId, ...subscriber }) => subscriber);
}