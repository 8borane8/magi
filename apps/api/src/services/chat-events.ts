export type ChatLiveEvent =
	| { type: "idle" }
	| { type: "init"; startedAt: number; text: string }
	| { type: "delta"; text: string }
	| { type: "done"; data: unknown }
	| { type: "error"; error: string };

type Hub = {
	startedAt: number;
	text: string;
	listeners: Set<(event: ChatLiveEvent) => void>;
};

const hubs = new Map<string, Hub>();

function emit(hub: Hub, event: ChatLiveEvent): void {
	for (const listener of hub.listeners) listener(event);
}

export function isBusy(lectureId: string): boolean {
	return hubs.has(lectureId);
}

export function startChat(lectureId: string): boolean {
	if (hubs.has(lectureId)) return false;
	hubs.set(lectureId, {
		startedAt: Date.now(),
		text: "",
		listeners: new Set(),
	});
	return true;
}

export function appendDelta(lectureId: string, text: string): void {
	const hub = hubs.get(lectureId);
	if (!hub) return;
	hub.text += text;
	emit(hub, { type: "delta", text });
}

export function endChat(
	lectureId: string,
	event: Extract<ChatLiveEvent, { type: "done" | "error" }>,
): void {
	const hub = hubs.get(lectureId);
	if (hub) emit(hub, event);
	hubs.delete(lectureId);
}

export function followChat(
	lectureId: string,
	onEvent: (event: ChatLiveEvent) => void,
	signal: AbortSignal,
): Promise<void> {
	const hub = hubs.get(lectureId);
	if (!hub) {
		onEvent({ type: "idle" });
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		const listener = (event: ChatLiveEvent) => {
			onEvent(event);
			if (event.type === "done" || event.type === "error") stop();
		};
		const stop = () => {
			hub.listeners.delete(listener);
			signal.removeEventListener("abort", stop);
			resolve();
		};
		onEvent({
			type: "init",
			startedAt: hub.startedAt,
			text: hub.text,
		});
		hub.listeners.add(listener);
		if (signal.aborted) stop();
		else signal.addEventListener("abort", stop);
	});
}
