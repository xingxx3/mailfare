"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { authFetch } from "@/lib/auth/client";
import { formatEmailAddress } from "@/lib/email/address";

type Subscriber = {
	id: string;
	email: string;
	name: string | null;
	status: string;
	verifiedAt: string | null;
	unsubscribed: boolean;
	source: string;
	createdAt: string;
};

function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "—"
		: date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SubscribersPage() {
	const qc = useQueryClient();
	const { mailboxes } = useSelectedMailbox();
	const [fromKey, setFromKey] = useState("");
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [sendAsHtml, setSendAsHtml] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	const { data: subscribers, isLoading } = useQuery({
		queryKey: ["subscribers"],
		queryFn: async () => {
			const res = await authFetch("/api/subscribers");
			const json = (await res.json()) as { subscribers?: Subscriber[]; error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to load subscribers");
			return json.subscribers ?? [];
		},
	});

	const senderOptions = useMemo(
		() =>
			mailboxes.flatMap((mailbox) => {
				const addresses = mailbox.senderAddresses?.length
					? mailbox.senderAddresses
					: [`${mailbox.localPart}@${mailbox.hostname}`];
				return addresses.map((address) => ({ mailbox, address }));
			}),
		[mailboxes],
	);

	useEffect(() => {
		if (senderOptions.length === 0 || fromKey) return;
		setFromKey(`${senderOptions[0].mailbox.id}|${senderOptions[0].address}`);
	}, [fromKey, senderOptions]);

	const verifiedCount = (subscribers ?? []).filter((item) => item.status === "verified").length;
	const pendingCount = (subscribers ?? []).filter((item) => item.status !== "verified").length;

	const sync = useMutation({
		mutationFn: async () => {
			const res = await authFetch("/api/subscribers/sync", { method: "POST" });
			const json = (await res.json()) as { updated?: number; error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to sync statuses");
			return json.updated ?? 0;
		},
		onSuccess: (updated) => {
			void qc.invalidateQueries({ queryKey: ["subscribers"] });
			setNotice(`Refreshed verification statuses${updated > 0 ? ` — ${updated} updated` : ""}.`);
		},
		onError: (err) => setNotice(err instanceof Error ? err.message : "Failed to sync statuses"),
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			const res = await authFetch(`/api/subscribers/${id}`, { method: "DELETE" });
			const json = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to delete subscriber");
		},
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ["subscribers"] });
		},
	});

	const resend = useMutation({
		mutationFn: async (id: string) => {
			const res = await authFetch(`/api/subscribers/${id}/resend`, { method: "POST" });
			const json = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to resend verification");
		},
		onSuccess: () => setNotice("Verification email re-sent to the subscriber."),
		onError: (err) => setNotice(err instanceof Error ? err.message : "Failed to resend verification"),
	});

	const broadcast = useMutation({
		mutationFn: async () => {
			const [mailboxId, address] = fromKey.split("|");
			const sender = senderOptions.find(
				(option) => option.mailbox.id === mailboxId && option.address === address,
			);
			const res = await authFetch("/api/subscribers/broadcast", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mailboxId,
					from: sender ? formatEmailAddress(sender.address, sender.mailbox.displayName) : address,
					subject,
					html: sendAsHtml ? body : undefined,
					text: sendAsHtml ? undefined : body,
				}),
			});
			const json = (await res.json()) as { error?: string; queued?: number; recipients?: number };
			if (!res.ok) throw new Error(json.error ?? "Broadcast failed");
			return { queued: json.queued ?? 0, recipients: json.recipients ?? 0 };
		},
		onSuccess: ({ queued, recipients }) => {
			setNotice(`Queued ${queued} promotional email(s) to ${recipients} verified subscriber(s).`);
			setSubject("");
			setBody("");
		},
		onError: (err) => setNotice(err instanceof Error ? err.message : "Broadcast failed"),
	});

	return (
		<div className="space-y-6 max-w-3xl">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">Subscribers</h1>
					<p className="mt-1 text-sm text-neutral-500">
						People who signed up from the public page. Cloudflare sends each one a verification
						link — once they click it, they are verified and ready to receive your messages.
					</p>
				</div>
				<Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
					<RefreshCw className={sync.isPending ? "size-4 animate-spin" : "size-4"} />
					Refresh statuses
				</Button>
			</div>

			{notice && (
				<p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
					{notice}
				</p>
			)}

			{!isLoading && (subscribers ?? []).length > 0 && (
				<div className="flex flex-wrap gap-3 text-sm">
					<Badge variant="default">{verifiedCount} verified</Badge>
					<Badge variant="secondary">{pendingCount} pending</Badge>
					<Badge variant="secondary">{(subscribers ?? []).length} total</Badge>
				</div>
			)}

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Megaphone className="size-4" /> Send update to verified subscribers
					</CardTitle>
					<CardDescription>
						Sent from your mailbox to every address that clicked the verification link. Unverified
						subscribers are skipped automatically.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="broadcast-from">From</Label>
						<Select
							id="broadcast-from"
							value={fromKey}
							onChange={(event) => setFromKey(event.target.value)}
							disabled={senderOptions.length === 0}
						>
							{!fromKey && <option value="">Select a mailbox first</option>}
							{senderOptions.map(({ mailbox, address }) => (
								<option key={`${mailbox.id}|${address}`} value={`${mailbox.id}|${address}`}>
									{address}
								</option>
							))}
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-subject">Subject</Label>
						<Input
							id="broadcast-subject"
							value={subject}
							onChange={(event) => setSubject(event.target.value)}
							placeholder="Exciting news!"
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="broadcast-body">Message</Label>
						<Textarea
							id="broadcast-body"
							value={body}
							onChange={(event) => setBody(event.target.value)}
							placeholder="Write your promotional message…"
							rows={8}
							required
						/>
						<p className="text-xs text-neutral-500">
							<input
								id="broadcast-html"
								type="checkbox"
								checked={sendAsHtml}
								onChange={(event) => setSendAsHtml(event.target.checked)}
								className="mr-1.5 align-middle"
							/>
							<label htmlFor="broadcast-html" className="align-middle">
								Send as HTML (advanced)
							</label>
						</p>
					</div>
					<Button
						onClick={() => broadcast.mutate()}
						disabled={!fromKey || !subject.trim() || !body.trim() || broadcast.isPending}
					>
						<Megaphone className="size-4" />
						{broadcast.isPending ? "Sending…" : `Send to ${verifiedCount} verified`}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Subscriber list</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					{isLoading && <p className="text-neutral-500">Loading…</p>}
					{!isLoading && (subscribers ?? []).length === 0 && (
						<p className="text-neutral-500">
							No subscribers yet. Point visitors to <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">/subscribe</code>{" "}
							on this app to sign up, or link to the same endpoint from anywhere on your site.
						</p>
					)}
					{(subscribers ?? []).map((subscriber) => (
						<div
							key={subscriber.id}
							className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2"
						>
							<div className="min-w-0">
								<p className="truncate font-medium text-neutral-900">{subscriber.email}</p>
								<p className="truncate text-xs text-neutral-500">
									{subscriber.name ?? "—"} · signed up {formatDate(subscriber.createdAt)}
									{subscriber.verifiedAt ? ` · verified ${formatDate(subscriber.verifiedAt)}` : ""}
								</p>
							</div>
							<span className="flex shrink-0 items-center gap-2">
								<Badge variant={subscriber.status === "verified" ? "default" : "secondary"}>
									{subscriber.status}
								</Badge>
								{subscriber.status !== "verified" && (
									<Button
										variant="ghost"
										size="sm"
										title="Re-send verification email"
										onClick={() => resend.mutate(subscriber.id)}
										disabled={resend.isPending}
									>
										<RotateCcw className="size-4" />
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									title="Delete subscriber"
									onClick={() => {
										if (confirm(`Remove ${subscriber.email}?`)) remove.mutate(subscriber.id);
									}}
								>
									<Trash2 className="size-4" />
								</Button>
							</span>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}