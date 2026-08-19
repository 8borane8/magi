export type ProcessStage = "transcribe" | "classify" | "fiche";

export type ProcessEvent =
	| { type: "init"; stage: ProcessStage; startedAt: number; preview: string }
	| { type: "stage"; stage: ProcessStage }
	| { type: "delta"; text: string }
	| { type: "done" }
	| { type: "error"; error: string };

type Hub = {
	startedAt: number;
	stage: ProcessStage;
	preview: string;
	listeners: Set<(event: ProcessEvent) => void>;
};

const PREVIEW_MAX = 4000;
const hubs = new Map<string, Hub>();

function emit(hub: Hub, event: ProcessEvent): void {
	for (const listener of hub.listeners) listener(event);
}

export function startProcess(lectureId: string): void {
	hubs.set(lectureId, {
		startedAt: Date.now(),
		stage: "transcribe",
		preview: "",
		listeners: new Set(),
	});
}

export function setStage(lectureId: string, stage: ProcessStage): void {
	const hub = hubs.get(lectureId);
	if (!hub) return;
	hub.stage = stage;
	if (stage !== "fiche") hub.preview = "";
	emit(hub, { type: "stage", stage });
}

export function appendDelta(lectureId: string, text: string): void {
	const hub = hubs.get(lectureId);
	if (!hub) return;
	hub.preview = (hub.preview + text).slice(-PREVIEW_MAX);
	emit(hub, { type: "delta", text });
}

function subscribeProcess(
	lectureId: string,
	listener: (event: ProcessEvent) => void,
): () => void {
	const hub = hubs.get(lectureId);
	if (!hub) return () => {};
	listener({
		type: "init",
		stage: hub.stage,
		startedAt: hub.startedAt,
		preview: hub.preview,
	});
	hub.listeners.add(listener);
	return () => hub.listeners.delete(listener);
}

export function endProcess(lectureId: string, error?: string): void {
	const hub = hubs.get(lectureId);
	if (hub) emit(hub, error ? { type: "error", error } : { type: "done" });
	hubs.delete(lectureId);
}

export async function followProcess(
	lectureId: string,
	onEvent: (event: ProcessEvent) => void,
	until: Promise<void>,
	signal: AbortSignal,
): Promise<void> {
	if (signal.aborted) return;

	await new Promise<void>((resolve) => {
		let stopped = false;
		let unsub = () => {};

		const stop = () => {
			if (stopped) return;
			stopped = true;
			unsub();
			signal.removeEventListener("abort", stop);
			resolve();
		};

		signal.addEventListener("abort", stop);
		unsub = subscribeProcess(lectureId, (event) => {
			onEvent(event);
			if (event.type === "done" || event.type === "error") stop();
		});

		void until.then(() => {
			if (!stopped) onEvent({ type: "done" });
			stop();
		});
	});
}
