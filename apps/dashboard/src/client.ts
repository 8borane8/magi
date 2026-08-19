import type { AppRouter } from "@magi/api";
import { HttpClient } from "@webtools/expressapi";

import { Cookies } from "@webtools/slick-client";

type MagiClient = HttpClient<AppRouter>;

function env(name: string): string | undefined {
	try {
		return Deno.env.get(name) || undefined;
	} catch {
		return undefined;
	}
}

export function nodeUrl(cookie?: string | null): string | undefined {
	let raw = env("MAGI_NODE_URL") || cookie || undefined;

	if (!raw && typeof document !== "undefined") {
		raw = document.querySelector("header[data-node-url]")?.getAttribute("data-node-url") ||
			Cookies.get("nodeUrl") ||
			undefined;
	}

	return raw?.replace(/\/+$/, "") || undefined;
}

export function resolveNodeUrl(cookie?: string | null): string {
	let url = nodeUrl(cookie);
	if (!url) throw new Error("No node URL found.");

	if (typeof document === "undefined") {
		const gateway = env("MAGI_HOST_GATEWAY");
		if (gateway) {
			try {
				const parsed = new URL(url);
				if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
					parsed.hostname = gateway;
					url = parsed.origin;
				}
			} catch {
				// Keep the original URL if it is not parseable.
			}
		}
	}

	return url;
}

export function createClient(baseUrl?: string): MagiClient {
	return new HttpClient<AppRouter>({ baseUrl: resolveNodeUrl(baseUrl) });
}

export async function waitLecture(lectureId: string, signal?: AbortSignal): Promise<void> {
	const url = nodeUrl();
	if (!url) throw new Error("No node URL found.");

	const response = await fetch(`${url}/lectures/${encodeURIComponent(lectureId)}/wait`, { signal });
	if (!response.ok) throw new Error("wait_failed");
}
