// Tiny email-only Worker for the self-hosted ($0) Mailflare deployment.
//
// Cloudflare Email Routing invokes this Worker's `email()` handler for every
// inbound message. All it does is forward the raw message over HTTP to the
// locally-hosted app (via Cloudflare Tunnel), which then owns the parsing,
// storage and routing. The Worker touches no D1/R2/Queues bindings, so it
// stays a few microseconds of compute and comfortably fits the free-tier CPU
// budget.
//
// If the local app is unreachable or rejects the message, this throws so
// Cloudflare bounces the email back to the sender (mirroring the upstream
// `message.setReject("Unknown recipient")` behavior).

type ForwarderEnv = {
	FORWARD_URL: string;
	INBOUND_FORWARD_SECRET?: string;
};

const RELEVANT_HEADERS = new Set([
	"message-id",
	"references",
	"in-reply-to",
	"reply-to",
	"auto-submitted",
	"list-id",
	"list-unsubscribe",
	"x-mailflare-forwarded",
]);

export default {
	async email(
		message: ForwardableEmailMessage,
		env: ForwarderEnv,
	): Promise<void> {
		if (!env.FORWARD_URL) throw new Error("FORWARD_URL is not configured");

		const headers = new Headers({ "Content-Type": "message/rfc822" });
		headers.set("x-mailflare-from", message.from);
		headers.set("x-mailflare-to", message.to);
		if (env.INBOUND_FORWARD_SECRET) {
			headers.set("x-mailflare-secret", env.INBOUND_FORWARD_SECRET);
		}

		const original: Record<string, string> = {};
		for (const [key, value] of message.headers) {
			if (RELEVANT_HEADERS.has(key.toLowerCase())) original[key] = value;
		}
		headers.set("x-mailflare-headers", btoa(JSON.stringify(original)));

		const url = env.FORWARD_URL.replace(/\/+$/, "") + "/api/inbound";
		const response = await fetch(url, {
			method: "POST",
			headers,
			body: message.raw,
		});
		if (!response.ok) {
			const detail = await response.text();
			throw new Error(
				`Mailflare inbound rejected message: HTTP ${response.status} ${detail.slice(0, 200)}`,
			);
		}
	},
// HTTP requests to the workers.dev URL (e.g. mailfare.<subdomain>.workers.dev)
// would otherwise trigger Cloudflare error 1101, because this Worker has no
// fetch() handler. The self-hosted app lives behind the Cloudflare Tunnel at
// FORWARD_URL, so politely send browser traffic there instead. Path and query
// are preserved (it's the same app on both sides of the tunnel).
async fetch(request: Request, env: ForwarderEnv): Promise<Response> {
	const forwarderBase = (env.FORWARD_URL || "").replace(/\/+$/, "");
	if (!forwarderBase) {
		return new Response("Self-hosted Mailflare is not configured (missing FORWARD_URL).", {
			status: 503,
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		});
	}
	const incoming = new URL(request.url);
	return Response.redirect(`${forwarderBase}${incoming.pathname}${incoming.search}`, 302);
},
async queue(batch: MessageBatch): Promise<void> {
		// No-op: the previous `mailfare` script consumed the app queues. In the
		// self-hosted ($0) deployment all processing happens in the locally-hosted
		// app, so any straggler events are acknowledged and dropped.
		for (const msg of batch.messages) {
			msg.ack();
		}
	},
} satisfies ExportedHandler<ForwarderEnv>;