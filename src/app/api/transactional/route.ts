import { NextResponse } from "next/server";
import { getEnv } from "@/lib/cloudflare";
import { readJsonBody } from "@/lib/http/request";
import { RequestBodyTooLargeError } from "@/lib/http/errors";

// Service-account endpoint for server-to-server transactional mail
// (akama-2 signup verification). Unlike /api/send and /api/v1/send it is NOT
// user-authed: no session/API key, no mailbox or sent-folder writes —
// HMAC-signed requests go straight to the EMAIL send_email binding.
//
// Contract (mirrored in akama-2 backend/services/mailfareEmailService.js):
//   POST { v, t, to, subject, html?, text?, sig }
//   sig = hex(HMAC_SHA256(MAILFARE_TX_KEY, `${t}.${v}.${to}.${subject}`))
//
// Config: MAILFARE_TX_FROM (var) + MAILFARE_TX_KEY (secret). The from address
// must be on a domain verified for sending in this Cloudflare account.

const SIGNATURE_VERSION = 1;
const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 500 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TransactionalBody = {
	v?: unknown;
	t?: unknown;
	to?: unknown;
	subject?: unknown;
	html?: unknown;
	text?: unknown;
	sig?: unknown;
};

// In-memory rate limits (per isolate; move to a ratelimits binding for prod).
const hits = new Map<string, number[]>();
function rateLimited(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	arr.push(now);
	hits.set(key, arr);
	if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
	return arr.length > limit;
}

function serviceEnv(env: CloudflareEnv): { key: string; from: string } {
	// New vars may predate the next `npm run cf-typegen`; read defensively.
	const record = env as unknown as Record<string, string | undefined>;
	return {
		key: record.MAILFARE_TX_KEY ?? "",
		from: record.MAILFARE_TX_FROM ?? "",
	};
}

async function hmacHex(key: string, message: string): Promise<string> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time string compare (Workers have no node:crypto.timingSafeEqual).
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export async function POST(request: Request) {
	const env = getEnv();
	const { key, from } = serviceEnv(env);
	if (!key || !from || !env.EMAIL) {
		return NextResponse.json(
			{ ok: false, error: "transactional endpoint not configured" },
			{ status: 500 },
		);
	}

	let body: TransactionalBody;
	try {
		body = await readJsonBody<TransactionalBody>(request, MAX_REQUEST_BYTES);
	} catch (error) {
		const status = error instanceof RequestBodyTooLargeError ? 413 : 400;
		return NextResponse.json({ ok: false, error: "invalid request" }, { status });
	}
	const { v, t, to, subject, html, text, sig } = body ?? {};

	if (v !== SIGNATURE_VERSION) {
		return NextResponse.json({ ok: false, error: "unsupported signature version" }, { status: 400 });
	}
	if (typeof t !== "number" || Math.abs(Date.now() - t) > MAX_SKEW_MS) {
		return NextResponse.json({ ok: false, error: "stale timestamp" }, { status: 400 });
	}
	if (typeof to !== "string" || !EMAIL_RE.test(to)) {
		return NextResponse.json({ ok: false, error: "invalid recipient" }, { status: 400 });
	}
	if (typeof subject !== "string" || subject.length < 1 || subject.length > 200) {
		return NextResponse.json({ ok: false, error: "invalid subject" }, { status: 400 });
	}
	const htmlBody = typeof html === "string" ? html : "";
	const textBody = typeof text === "string" ? text : "";
	if (!htmlBody && !textBody) {
		return NextResponse.json({ ok: false, error: "html or text required" }, { status: 400 });
	}
	if (htmlBody.length + textBody.length > MAX_BODY_BYTES) {
		return NextResponse.json({ ok: false, error: "body too large" }, { status: 400 });
	}
	if (typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) {
		return NextResponse.json({ ok: false, error: "invalid signature format" }, { status: 401 });
	}

	const ip =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown";
	if (rateLimited(`tx:rcpt:${to}`, 30, 60_000) || rateLimited(`tx:ip:${ip}`, 120, 60_000)) {
		return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
	}

	const expected = await hmacHex(key, [t, v, to, subject].join("."));
	if (!safeEqual(expected, sig)) {
		return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
	}

	try {
		const sent = await env.EMAIL.send({
			from,
			to,
			subject,
			html: htmlBody || undefined,
			text: textBody || undefined,
		});
		return NextResponse.json({ ok: true, messageId: sent?.messageId ?? `tx-${t}` });
	} catch (err) {
		console.error("[transactional] EMAIL.send failed:", err);
		return NextResponse.json({ ok: false, error: "email send failed" }, { status: 502 });
	}
}
