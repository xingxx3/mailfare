import { DurableObject } from "cloudflare:workers";
import type { NewMessageNotification } from "./types";

// Renamed from `RealtimeHub`: the published script's DO migration history
// recorded this class as deleted (v2-drop-realtime from the email-forwarder
// deploys), and DO migrations are append-only — so the class must be
// re-registered under a fresh name (see wrangler.jsonc v3 migration).
export class MailflareRealtimeHub extends DurableObject<CloudflareEnv> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/connect") {
			if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
				return new Response("Expected WebSocket upgrade", { status: 426 });
			}

			const pair = new WebSocketPair();
			const client = pair[0];
			const server = pair[1];
			this.ctx.acceptWebSocket(server);

			return new Response(null, { status: 101, webSocket: client });
		}

		if (url.pathname === "/notify" && request.method === "POST") {
			const payload = (await request.json()) as NewMessageNotification;
			const message = JSON.stringify(payload);

			for (const socket of this.ctx.getWebSockets()) {
				try {
					socket.send(message);
				} catch {
					socket.close(1011, "Delivery failed");
				}
			}

			return new Response(null, { status: 204 });
		}

		return new Response("Not found", { status: 404 });
	}

	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
		if (message === "ping") socket.send("pong");
	}
}
