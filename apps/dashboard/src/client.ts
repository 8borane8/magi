import type { AppRouter } from "@magi/api";
import { HttpClient } from "@webtools/expressapi";
import { Cookies } from "@webtools/slick-client";

import { readNdjson, sleep } from "./utils/ndjson.ts";

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

export type ProcessStreamEvent =
	| { type: "init"; stage: string }
	| { type: "stage"; stage: string }
	| { type: "done" }
	| { type: "error"; error: string };

export type ChatLiveEvent =
	| { type: "init"; startedAt: number; text: string }
	| { type: "delta"; text: string }
	| { type: "done"; data?: ChatLiveMessage }
	| { type: "error"; error: string };

type ChatLiveMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	attachments?: Array<{ kind: "image" | "pdf" | "text"; path: string; name?: string }> | null;
};

type LiveEvent = { type: string };

async function readLive<T extends LiveEvent>(
	path: string,
	onEvent: (event: T) => void,
	signal?: AbortSignal,
): Promise<void> {
	const url = nodeUrl();
	if (!url) throw new Error("No node URL found.");

	while (!signal?.aborted) {
		try {
			const response = await fetch(`${url}${path}`, {
				signal,
				cache: "no-store",
			});
			if (!response.ok) throw new Error("live_failed");
			let terminal = false;
			for await (const event of readNdjson<T>(response)) {
				if (event.type === "idle" || event.type === "done" || event.type === "error") {
					terminal = true;
				}
				if (event.type !== "idle") onEvent(event);
				if (terminal) break;
			}
			if (terminal) return;
		} catch {
			if (signal?.aborted) return;
		}
		if (!signal) return;
		await sleep(500, signal);
	}
}

export function watchLectureProcess(
	lectureId: string,
	onEvent: (event: ProcessStreamEvent) => void,
	signal?: AbortSignal,
): Promise<void> {
	return readLive(`/lectures/${encodeURIComponent(lectureId)}/wait`, onEvent, signal);
}

export function watchChatLive(
	lectureId: string,
	onEvent: (event: ChatLiveEvent) => void,
	signal?: AbortSignal,
): Promise<void> {
	return readLive(`/lectures/${encodeURIComponent(lectureId)}/chat/live`, onEvent, signal);
}
