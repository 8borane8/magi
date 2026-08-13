import { Cookies } from "@webtools/slick-client";

import { SessionStatus } from "@magi/shared/types/session";
import { createClient } from "../client.ts";

type Status = "idle" | "recording" | "paused" | "stopping";
type ServerAction = "pause" | "resume" | "stop";
type SendResult = { kind: "sent" } | { kind: "retry" } | { kind: "fatal"; message: string };

const CHUNK_MS = 5_000;
const RETRY_MS = 3_000;

const ACTION_PATH = {
	pause: "/lectures/:lectureId/pause",
	resume: "/lectures/:lectureId/resume",
	stop: "/lectures/:lectureId/stop",
} as const;

function pickMimeType(): string {
	for (const type of ["audio/webm;codecs=opus", "audio/webm"]) {
		if (MediaRecorder.isTypeSupported(type)) return type;
	}
	throw new Error("Ce navigateur ne prend pas en charge l'enregistrement audio.");
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Mic first, node second. Chunks every 5s on an ordered in-memory queue.
 * Reload drops the queue; `attach()` takes back a lecture left paused on the node.
 */
class RecordSession {
	status: Status = "idle";
	error: string | null = null;
	offline = false;
	lectureId: string | null = null;
	elapsedSec = 0;

	private listeners = new Set<() => void>();
	private stream: MediaStream | null = null;
	private recorder: MediaRecorder | null = null;
	private nextSeq = 0;
	private startedAt = 0;
	private pausedElapsedMs = 0;
	private clockTimer: ReturnType<typeof setInterval> | null = null;
	private chunkTimer: ReturnType<typeof setInterval> | null = null;
	private queue: { seq: number; blob: Blob }[] = [];
	private draining = false;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private watchingNetwork = false;

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async start(): Promise<void> {
		if (this.status !== "idle") return;
		this.error = null;
		this.watchNetwork();

		try {
			await this.openMicrophone();

			const response = await createClient().post("/lectures");
			if (!response.success) throw new Error("Impossible de créer le cours.");

			this.lectureId = response.data.lecture.id;
			this.nextSeq = response.data.upload.nextSeq ?? 0;
			this.startCapture();
			this.emit();
		} catch (error) {
			this.clearSession();
			this.error = errorMessage(error, "Impossible de démarrer l'enregistrement.");
			this.emit();
		}
	}

	async attach(lectureId: string): Promise<void> {
		if (this.lectureId === lectureId) return;
		if (this.status !== "idle" && this.status !== "paused") return;
		if (this.queue.length > 0) {
			this.error = "Des fragments audio restent à envoyer.";
			this.emit();
			return;
		}

		this.error = null;
		this.watchNetwork();

		try {
			const response = await createClient().get("/lectures/:lectureId", { params: { lectureId } });
			if (!response.success) throw new Error("Ce cours est introuvable sur le noeud.");
			if (response.data.status !== SessionStatus.PAUSED) {
				throw new Error("Ce cours n'est plus en pause.");
			}

			// Drop the previous lecture only after the fetch, so the bar never blinks idle.
			this.clearSession();

			this.lectureId = lectureId;
			this.nextSeq = (response.data.lastSeq ?? -1) + 1;
			this.pausedElapsedMs = response.data.audioMs ?? 0;
			this.elapsedSec = Math.floor(this.pausedElapsedMs / 1_000);
			this.status = "paused";
			this.emit();
		} catch (error) {
			this.error = errorMessage(error, "Impossible d'ouvrir ce cours.");
			this.emit();
		}
	}

	detach(): void {
		if (this.status !== "paused") return;
		if (this.queue.length > 0) {
			this.error = "Des fragments audio restent à envoyer.";
			this.emit();
			return;
		}

		this.clearSession();
		this.emit();
	}

	async pause(): Promise<void> {
		if (this.status !== "recording") return;
		this.error = null;
		this.clearChunkTimer();

		await this.requestFragment();
		this.recorder?.pause();
		this.pausedElapsedMs += Date.now() - this.startedAt;
		this.elapsedSec = Math.floor(this.pausedElapsedMs / 1_000);
		this.status = "paused";
		this.stopClock();
		this.emit();

		await this.postAction("pause");
		this.emit();
	}

	async resume(): Promise<void> {
		if (this.status !== "paused" || !this.lectureId) return;
		this.error = null;

		try {
			if (!this.recorder) await this.openMicrophone();
			this.startCapture();
			this.emit();
		} catch (error) {
			this.error = errorMessage(error, "Impossible de reprendre l'enregistrement.");
			this.emit();
			return;
		}

		await this.postAction("resume");
		this.emit();
	}

	async stop(): Promise<void> {
		if (this.status === "idle" || this.status === "stopping") return;
		this.error = null;
		this.status = "stopping";
		this.clearChunkTimer();
		this.stopClock();
		this.emit();

		await this.stopRecorder();
		this.flush();
	}

	private async openMicrophone(): Promise<void> {
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

		const recorder = new MediaRecorder(this.stream, { mimeType: pickMimeType() });
		recorder.addEventListener("dataavailable", (event) => {
			if (event.data.size === 0) return;
			this.queue.push({ seq: this.nextSeq++, blob: event.data });
			this.drain();
		});
		recorder.addEventListener("error", () => {
			this.error = "Le navigateur a interrompu l'enregistrement audio.";
			this.emit();
		});

		this.recorder = recorder;
	}

	private startCapture(): void {
		if (this.recorder?.state === "paused") this.recorder.resume();
		else if (this.recorder?.state === "inactive") this.recorder.start();

		this.startedAt = Date.now();
		this.status = "recording";
		this.startChunkTimer();
		this.startClock();
	}

	// Chrome does not split reliably with `start(timeslice)`.
	private startChunkTimer(): void {
		this.clearChunkTimer();
		this.chunkTimer = globalThis.setInterval(() => this.recorder?.requestData(), CHUNK_MS);
	}

	private clearChunkTimer(): void {
		if (this.chunkTimer === null) return;
		clearInterval(this.chunkTimer);
		this.chunkTimer = null;
	}

	private requestFragment(): Promise<void> {
		const recorder = this.recorder;
		if (recorder?.state !== "recording") return Promise.resolve();

		return new Promise((resolve) => {
			recorder.addEventListener("dataavailable", () => resolve(), { once: true });
			recorder.requestData();
		});
	}

	private async stopRecorder(): Promise<void> {
		const recorder = this.recorder;
		if (!recorder || recorder.state === "inactive") {
			this.releaseStream();
			return;
		}

		await new Promise<void>((resolve) => {
			recorder.addEventListener("stop", () => resolve(), { once: true });
			recorder.stop();
		});
		this.releaseStream();
	}

	private releaseStream(): void {
		for (const track of this.stream?.getTracks() ?? []) track.stop();
		this.stream = null;
		this.recorder = null;
	}

	private flush(): void {
		if (this.queue.length > 0) this.drain();
		else void this.finishStop();
	}

	private drain(): void {
		if (this.draining || this.queue.length === 0) return;
		this.draining = true;
		void this.drainLoop();
	}

	private async drainLoop(): Promise<void> {
		try {
			while (this.queue.length > 0) {
				const result = await this.sendChunk(this.queue[0]);

				if (result.kind === "sent") {
					this.queue.shift();
					if (this.offline) {
						this.offline = false;
						this.emit();
					}
					continue;
				}

				if (result.kind === "retry") {
					this.offline = true;
					this.emit();
					this.scheduleRetry();
					return;
				}

				this.clearSession();
				this.error = result.message;
				this.emit();
				return;
			}
		} finally {
			this.draining = false;
		}

		await this.finishStop();
	}

	private async sendChunk(chunk: { seq: number; blob: Blob }): Promise<SendResult> {
		const nodeUrl = Cookies.get("nodeUrl");
		if (!nodeUrl || !this.lectureId) return { kind: "retry" };

		const url = `${nodeUrl.replace(/\/+$/, "")}/lectures/${encodeURIComponent(this.lectureId)}/chunks/${chunk.seq}`;

		let response: Response;
		try {
			// audio/* is parsed as something else and rejected with 415.
			response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/octet-stream" },
				body: chunk.blob,
			});
		} catch {
			return { kind: "retry" };
		}

		if (response.ok) return { kind: "sent" };

		const payload = await response.json().catch(() => null);
		const code = typeof payload?.error === "string" ? payload.error : null;

		if (code === "sequence_duplicate") return { kind: "sent" };
		if (response.status >= 500) return { kind: "retry" };
		if (response.status === 404) {
			return { kind: "fatal", message: "Ce cours n'existe plus sur le noeud." };
		}
		if (code === "lecture_finished") {
			return { kind: "fatal", message: "Ce cours est déjà terminé." };
		}
		if (code === "insufficient_storage") {
			return { kind: "fatal", message: "Le noeud n'a plus d'espace de stockage." };
		}
		return { kind: "fatal", message: "Le noeud a refusé un fragment audio." };
	}

	private scheduleRetry(): void {
		if (this.retryTimer !== null) return;
		this.retryTimer = globalThis.setTimeout(() => {
			this.retryTimer = null;
			this.flush();
		}, RETRY_MS);
	}

	private async finishStop(): Promise<void> {
		if (this.status !== "stopping" || this.queue.length > 0) return;

		if (!await this.postAction("stop")) {
			this.scheduleRetry();
			return;
		}

		this.clearSession();
		this.emit();
	}

	private async postAction(action: ServerAction): Promise<boolean> {
		const lectureId = this.lectureId;
		if (!lectureId) return false;

		try {
			const response = await createClient().post(ACTION_PATH[action], { params: { lectureId } });
			this.offline = false;
			return response.success;
		} catch {
			this.offline = true;
			return false;
		}
	}

	private watchNetwork(): void {
		this.offline = !navigator.onLine;
		if (this.watchingNetwork) return;
		this.watchingNetwork = true;

		globalThis.addEventListener("online", () => {
			this.offline = false;
			this.emit();
			this.flush();
		});
		globalThis.addEventListener("offline", () => {
			this.offline = true;
			this.emit();
		});
	}

	private startClock(): void {
		this.stopClock();
		this.clockTimer = globalThis.setInterval(() => {
			const next = Math.floor((this.pausedElapsedMs + (Date.now() - this.startedAt)) / 1_000);
			if (next === this.elapsedSec) return;
			this.elapsedSec = next;
			this.emit();
		}, 250);
	}

	private stopClock(): void {
		if (this.clockTimer === null) return;
		clearInterval(this.clockTimer);
		this.clockTimer = null;
	}

	private clearSession(): void {
		this.clearChunkTimer();
		this.stopClock();
		this.releaseStream();
		if (this.retryTimer !== null) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}

		this.queue = [];
		this.draining = false;
		this.status = "idle";
		this.lectureId = null;
		this.elapsedSec = 0;
		this.pausedElapsedMs = 0;
		this.nextSeq = 0;
		this.error = null;
		this.offline = false;
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

// Slick bundles each island apart, so a module singleton would not be shared.
const SESSION_KEY = Symbol.for("magi.record-session");
const globalScope = globalThis as unknown as Record<symbol, RecordSession | undefined>;

export const recordSession: RecordSession = globalScope[SESSION_KEY] ??= new RecordSession();
