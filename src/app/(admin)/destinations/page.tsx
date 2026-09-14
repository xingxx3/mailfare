"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth/client";

type Destination = {
	id: string;
	email: string;
	status: string;
	verified: string | null;
	created: string;
};

export default function DestinationsPage() {
	const qc = useQueryClient();
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ["destinations"],
		queryFn: async () => {
			const res = await authFetch("/api/destinations");
			const json = (await res.json()) as { destinations?: Destination[]; error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to load destinations");
			return json.destinations ?? [];
		},
	});

	const register = useMutation({
		mutationFn: async () => {
			setError(null);
			const res = await authFetch("/api/destinations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const json = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(json.error ?? "Failed to register address");
			setEmail("");
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["destinations"] }),
		onError: (err) => setError(err instanceof Error ? err.message : "Failed to register address"),
	});

	const remove = useMutation({
		mutationFn: async (id: string) => {
			const res = await authFetch(`/api/destinations/${id}`, { method: "DELETE" });
			if (!res.ok) throw new Error("Failed to delete address");
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ["destinations"] }),
	});

	return (
		<div className="space-y-6 max-w-2xl">
			<h1 className="text-2xl font-semibold">Destination addresses</h1>
			<p className="text-sm text-neutral-500">
				Cloudflare only delivers outbound mail to verified destination addresses. Register an
				address here, then have its owner click the verification link Cloudflare emails them.
				After that you can send to it normally from the compose screen.
			</p>
			<Card>
				<CardHeader>
					<CardTitle>Register address</CardTitle>
					<CardDescription>A verification email is sent to the address.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="destination-email">Email address</Label>
						<Input
							id="destination-email"
							type="email"
							placeholder="someone@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					{error && <p className="text-sm text-red-600">{error}</p>}
					<Button onClick={() => register.mutate()} disabled={!email || register.isPending}>
						{register.isPending ? "Registering…" : "Register"}
					</Button>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Registered addresses</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					{isLoading && <p className="text-neutral-500">Loading…</p>}
					{!isLoading && (data ?? []).length === 0 && (
						<p className="text-neutral-500">No destination addresses registered yet.</p>
					)}
					{(data ?? []).map((d) => (
						<div key={d.id} className="flex items-center justify-between gap-3">
							<span className="truncate">{d.email}</span>
							<span className="flex items-center gap-2">
								<Badge variant={d.status === "verified" ? "default" : "secondary"}>
									{d.status}
								</Badge>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => remove.mutate(d.id)}
									disabled={remove.isPending}
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