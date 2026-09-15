import type { Metadata } from "next";
import { SubscribeClient } from "./subscribe-client";

export const metadata: Metadata = {
	title: "Subscribe",
	description: "Sign up to receive updates and promotional messages.",
};

export default function SubscribePage() {
	return <SubscribeClient />;
}