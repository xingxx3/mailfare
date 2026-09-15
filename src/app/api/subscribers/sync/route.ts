import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { assertAdmin } from "@/lib/auth/admin";
import { syncSubscriberStatuses } from "@/lib/subscribers/service";

export async function POST(request: Request) {
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	try {
		assertAdmin(user);
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		const result = await syncSubscriberStatuses(env);
		return NextResponse.json({ ok: true, ...result });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to sync subscriber statuses";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}