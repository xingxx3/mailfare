import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { requireUser } from "@/lib/auth/cookies";
import { assertAdmin } from "@/lib/auth/admin";
import { deleteDestinationAddress } from "@/lib/cloudflare-api";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
	const { id } = await params;
	const env = getEnv();
	const user = await requireUser(env, request);
	try {
		assertAdmin(user);
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		await deleteDestinationAddress(env, id);
		return NextResponse.json({ ok: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to delete destination address";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}