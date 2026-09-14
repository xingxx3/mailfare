import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/cloudflare";
import { requireUser } from "@/lib/auth/cookies";
import { assertAdmin } from "@/lib/auth/admin";
import { createDestinationAddress, listDestinationAddresses } from "@/lib/cloudflare-api";

const destinationSchema = z.object({
	email: z.string().email(),
});

export async function GET(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	try {
		assertAdmin(user);
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	try {
		const addresses = await listDestinationAddresses(env);
		return NextResponse.json({ destinations: addresses });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to list destination addresses";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}

export async function POST(request: Request) {
	const env = getEnv();
	const user = await requireUser(env, request);
	try {
		assertAdmin(user);
	} catch {
		return NextResponse.json({ error: "Forbidden" }, { status: 403 });
	}

	const parsed = destinationSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
	}

	try {
		const destination = await createDestinationAddress(env, parsed.data.email.toLowerCase());
		return NextResponse.json({ destination });
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to create destination address";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}