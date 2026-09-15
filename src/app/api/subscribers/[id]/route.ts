import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/cookies";
import { assertAdmin } from "@/lib/auth/admin";
import { deleteSubscriber } from "@/lib/subscribers/service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await getCurrentUser(env, request);
	if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	try {
		assertAdmin(user);
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		const subscriber = await deleteSubscriber(env, id);
		return NextResponse.json({ ok: true, subscriber });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to delete subscriber";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}