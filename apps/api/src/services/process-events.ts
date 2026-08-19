import type { ProcessStage } from "@magi/shared/types/session";

export type ProcessEvent =
	| { type: "idle" }
	| { type: "init"; stage: ProcessStage; preview: string }
	| { type: "stage"; stage: ProcessStage }
	| { type: "delta"; text: string }
	| { type: "done" }
	| { type: "error"; error: string };

type Hub = {
	stage: ProcessStage;
	preview: string;
	listeners: Set<(event: ProcessEvent) => void>;
};

const PREVIEW_MAX = 4000;
const hubs = new Map<string, Hub>();

function emit(hub: Hub, event: ProcessEvent): void {
	for (const listener of hub.listeners) listener(event);
}

export function startProcess(lectureId: string, stage: ProcessStage = "transcribe"): void {
	hubs.set(lectureId, {
		stage,
		preview: "",
		listeners: new Set(),
	});
}

export function setStage(lectureId: string, stage: ProcessStage): void {
	const hub = hubs.get(lectureId);
	if (!hub || hub.stage === stage) return;
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

export function endProcess(lectureId: string, error?: string): void {
	const hub = hubs.get(lectureId);
	if (hub) emit(hub, error ? { type: "error", error } : { type: "done" });
	hubs.delete(lectureId);
}

export function followProcess(
	lectureId: string,
	onEvent: (event: ProcessEvent) => void,
	signal: AbortSignal,
): Promise<void> {
	const hub = hubs.get(lectureId);
	if (!hub) {
		onEvent({ type: "idle" });
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		const listener = (event: ProcessEvent) => {
			onEvent(event);
			if (event.type === "done" || event.type === "error") stop();
		};
		const stop = () => {
			hub.listeners.delete(listener);
			signal.removeEventListener("abort", stop);
			resolve();
		};
		onEvent({ type: "init", stage: hub.stage, preview: hub.preview });
		hub.listeners.add(listener);
		if (signal.aborted) stop();
		else signal.addEventListener("abort", stop);
	});
}
