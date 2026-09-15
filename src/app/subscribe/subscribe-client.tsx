"use client";

import { useState } from "react";
import { CheckCircle2, MailPlus } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TurnstileField } from "@/components/auth/turnstile";

export function SubscribeClient() {
	const [error, setError] = useState<string | null>(null);
	const [state, setState] = useState<"idle" | "submitting" | "done">("idle");
	const [turnstileReset, setTurnstileReset] = useState(0);

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setState("submitting");
		const form = new FormData(event.currentTarget);

		try {
			const res = await fetch("/api/subscribers", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: form.get("email"),
					name: form.get("name") || undefined,
					turnstileToken: form.get("turnstileToken") || undefined,
				}),
			});
			const data = (await res.json()) as { error?: unknown };
			if (!res.ok) {
				setError(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
				setTurnstileReset((value) => value + 1);
				setState("idle");
				return;
			}
			setState("done");
		} catch {
			setError("Unable to reach the signup service. Please try again.");
			setTurnstileReset((value) => value + 1);
			setState("idle");
		}
	}

	return (
		<AuthShell
			icon={MailPlus}
			title={state === "done" ? "Almost there!" : "Subscribe to updates"}
			description={
				state === "done"
					? "Check your inbox — a verification email is on its way."
					: "Join the list and we will send you occasional news and promotional messages."
			}
		>
			{state === "done" ? (
				<div className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-6">
					<p className="flex items-start gap-2 text-sm font-medium text-emerald-700">
						<CheckCircle2 className="mt-0.5 size-5 shrink-0" />
						<span>
							We sent you a <strong>verification link</strong>. Click it in the email to confirm your
							address — once verified, you will start receiving messages from us.
						</span>
					</p>
					<p className="text-xs leading-5 text-emerald-600">
						Did not see the email? Check your spam folder, then use the resend button on your
						verification email request or contact us.
					</p>
				</div>
			) : (
				<form method="post" onSubmit={(event) => void onSubmit(event)} className="space-y-5">
					<div className="space-y-2">
						<Label htmlFor="name">Name (optional)</Label>
						<Input id="name" name="name" autoComplete="name" placeholder="Jane Doe" />
					</div>
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							autoComplete="email"
							placeholder="jane@example.com"
							required
						/>
					</div>
					{error && (
						<p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
							{error}
						</p>
					)}
					<TurnstileField resetSignal={turnstileReset} />
					<Button
						type="submit"
						className="h-11 w-full rounded-full px-6"
						disabled={state === "submitting"}
					>
						{state === "submitting" ? "Signing you up…" : "Subscribe"}
					</Button>
				</form>
			)}
		</AuthShell>
	);
}