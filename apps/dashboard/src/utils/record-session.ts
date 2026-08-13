import { Cookies } from "@webtools/slick-client";
import { createClient } from "../client.ts";

const TIMESLICE_MS = 5000;

function pickMime(): string {
	const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
	return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

type UploadInfo = {
	status?: string;
	finished?: boolean;
	segmentIndex: number;
	nextSeq: number;
};

function syncRecordingRoot(status: "idle" | "recording" | "paused" | "flushing"): void {
	if (typeof document === "undefined") return;
	const root = document.getElementById("root");
	if (!root) return;
	if (status !== "idle") root.setAttribute("data-recording", "true");
	else root.removeAttribute("data-recording");
}

export class RecordSession {
	status: "idle" | "recording" | "paused" | "flushing" = "idle";
	error: string | null = null;
	lectureId: string | null = null;
	elapsedSec = 0;

	private listeners = new Set<() => void>();
	private queue: { seq: number; blob: Blob }[] = [];
	private flushPromise: Promise<void> | null = null;
	private nextSeq = 0;
	private segmentIndex = 0;
	private recorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private baseElapsed = 0;
	private runningSince = 0;
	private tick: ReturnType<typeof setInterval> | null = null;
	private stopping = false;
	private mime = "";

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		persistSnapshot(this);
		syncRecordingRoot(this.status);
		for (const listener of this.listeners) listener();
	}

	private durationSec(): number {
		if (!this.runningSince) return this.baseElapsed;
		return this.baseElapsed + Math.max(0, Math.round((Date.now() - this.runningSince) / 1000));
	}

	private startTick(): void {
		this.stopTick();
		this.tick = setInterval(() => {
			this.elapsedSec = this.durationSec();
			this.notify();
		}, 250);
	}

	private stopTick(): void {
		if (!this.tick) return;
		clearInterval(this.tick);
		this.tick = null;
	}

	private freezeClock(): void {
		this.baseElapsed = this.durationSec();
		this.runningSince = 0;
		this.elapsedSec = this.baseElapsed;
		this.stopTick();
	}

	async start(subjectId: string | null): Promise<void> {
		if (this.status !== "idle") return;
		this.error = null;
		this.mime = pickMime();

		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			this.error = "Le micro est inaccessible. Vérifiez les permissions du navigateur.";
			this.notify();
			return;
		}

		try {
			const client = createClient();
			const created = await client.post("/lectures", {
				body: { subjectId },
			}) as { id: string; upload: UploadInfo };

			this.lectureId = created.id;
			this.segmentIndex = created.upload.segmentIndex;
			this.nextSeq = created.upload.nextSeq;
			this.baseElapsed = 0;
			this.runningSince = Date.now();
			this.elapsedSec = 0;
			this.stopping = false;
			this.status = "recording";
			this.startTick();
			this.openRecorder();
			this.notify();
		} catch {
			this.stream.getTracks().forEach((track) => track.stop());
			this.stream = null;
			this.error = "Impossible de créer le cours sur le noeud.";
			this.notify();
		}
	}

	private openRecorder(): void {
		if (!this.stream) return;

		const recorder = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
		this.recorder = recorder;

		recorder.ondataavailable = (event) => {
			if (!event.data.size) return;
			this.queue.push({ seq: this.nextSeq, blob: event.data });
			this.nextSeq += 1;
			void this.flush();
		};

		recorder.onerror = () => {
			if (this.stopping) return;
			void this.restartEncoder();
		};

		recorder.start(TIMESLICE_MS);
	}

	private applyServerPaused(): void {
		if (this.status !== "recording") return;
		this.recorder?.pause();
		this.freezeClock();
		this.status = "paused";
		this.notify();
	}

	attach(lectureId: string, durationSec = 0): void {
		if (this.status === "recording" || this.status === "flushing") return;
		if (this.status === "paused" && this.lectureId === lectureId) return;

		this.dropLocalMedia();
		this.error = null;
		this.lectureId = lectureId;
		this.baseElapsed = durationSec;
		this.runningSince = 0;
		this.elapsedSec = durationSec;
		this.stopping = false;
		this.status = "paused";
		this.notify();
	}

	detach(): void {
		if (this.status !== "paused") return;
		this.cleanup();
		this.notify();
	}

	private dropLocalMedia(): void {
		this.stopTick();
		this.queue = [];
		try {
			if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
		} catch {
			// l'encodeur est déjà arrêté
		}
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
		this.recorder = null;
	}

	private async restartEncoder(): Promise<boolean> {
		if (this.stopping || !this.lectureId) return false;

		try {
			if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
		} catch {
			// l'encodeur est déjà arrêté
		}

		try {
			const client = createClient();
			const res = await client.post("/lectures/:lectureId/segments", {
				params: { lectureId: this.lectureId },
			}) as { upload: UploadInfo };
			this.segmentIndex = res.upload.segmentIndex;
			this.nextSeq = res.upload.nextSeq;
			this.openRecorder();
			return this.recorder?.state === "recording";
		} catch {
			this.error = "Impossible de relancer le segment d'enregistrement.";
			this.notify();
			return false;
		}
	}

	private flush(): Promise<void> {
		if (this.flushPromise) return this.flushPromise;
		this.flushPromise = this.flushLoop().finally(() => {
			this.flushPromise = null;
		});
		return this.flushPromise;
	}

	private async flushLoop(): Promise<void> {
		const baseUrl = Cookies.get("nodeUrl");
		const lectureId = this.lectureId;
		if (!baseUrl || !lectureId) return;

		let restart = false;

		while (this.queue.length && !restart) {
			if (this.lectureId !== lectureId) return;
			const item = this.queue[0];
			try {
				const res = await globalThis.fetch(
					`${baseUrl}/lectures/${lectureId}/segments/${this.segmentIndex}/chunks/${item.seq}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/octet-stream" },
						body: item.blob,
					},
				);

				if (this.lectureId !== lectureId) return;

				if (res.status === 507) {
					this.error = "Espace disque insuffisant sur le noeud.";
					this.notify();
					return;
				}

				if (res.status === 409) {
					const body = await res.json() as {
						error?: string;
						upload?: UploadInfo;
					};
					if (body.error === "sequence_gap" && body.upload) {
						const expected = body.upload.nextSeq;
						this.queue = this.queue.filter((chunk) => chunk.seq >= expected);
						if (!this.queue.length || this.queue[0].seq !== expected) {
							this.queue = [];
							restart = true;
						}
						continue;
					}
					if (body.error === "wrong_segment") {
						this.queue = [];
						restart = true;
						continue;
					}
					throw new Error("Conflit d'envoi du flux.");
				}

				if (!res.ok) throw new Error(`Envoi refusé (${res.status}).`);

				const body = await res.json() as { upload?: UploadInfo };
				this.queue.shift();
				if (body.upload?.status === "paused") this.applyServerPaused();
			} catch (error) {
				this.error = error instanceof Error ? error.message : "Envoi du flux interrompu.";
				this.notify();
				await sleep(800);
			}
		}

		if (restart && !this.stopping && this.lectureId === lectureId) await this.restartEncoder();
	}

	async pause(): Promise<void> {
		if (this.status !== "recording" || !this.lectureId) return;
		this.recorder?.pause();
		this.freezeClock();
		this.status = "paused";
		this.notify();

		try {
			const client = createClient();
			await client.post("/lectures/:lectureId/pause", {
				params: { lectureId: this.lectureId },
				query: { durationSec: this.elapsedSec },
			});
		} catch {
			this.error = "La pause n'a pas été enregistrée sur le noeud.";
			this.notify();
		}
	}

	async resume(): Promise<void> {
		if (this.status !== "paused" || !this.lectureId) return;

		if (!this.stream) {
			this.mime = pickMime();
			try {
				this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			} catch {
				this.error = "Le micro est inaccessible. Vérifiez les permissions du navigateur.";
				this.notify();
				return;
			}
		}

		try {
			const client = createClient();
			await client.post("/lectures/:lectureId/resume", { params: { lectureId: this.lectureId } });
		} catch {
			this.error = "La reprise n'a pas été enregistrée sur le noeud.";
			this.notify();
			return;
		}

		if (this.recorder?.state === "paused") this.recorder.resume();
		else if (!await this.restartEncoder()) return;

		this.runningSince = Date.now();
		this.status = "recording";
		this.startTick();
		this.notify();
	}

	async stop(): Promise<void> {
		if (this.status === "idle" || this.status === "flushing") return;
		this.stopping = true;
		this.status = "flushing";
		this.notify();

		try {
			if (this.recorder && this.recorder.state !== "inactive") {
				await new Promise<void>((resolve) => {
					const recorder = this.recorder!;
					recorder.onstop = () => resolve();
					recorder.stop();
					setTimeout(resolve, 1500);
				});
			}

			while (this.queue.length) await this.flush();

			if (this.lectureId) {
				const client = createClient();
				await client.post("/lectures/:lectureId/stop", {
					params: { lectureId: this.lectureId },
					query: { durationSec: this.durationSec() },
				});
			}
		} catch {
			this.error = "Arrêt impossible.";
		} finally {
			this.cleanup();
			this.notify();
		}
	}

	private cleanup(): void {
		this.stopTick();
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
		this.recorder = null;
		this.queue = [];
		this.lectureId = null;
		this.status = "idle";
		this.elapsedSec = 0;
		this.baseElapsed = 0;
		this.runningSince = 0;
		this.stopping = false;
	}
}

const SNAPSHOT_KEY = "magi-record";

type Snapshot = {
	lectureId: string;
	elapsedSec: number;
};

function readSnapshot(): Snapshot | null {
	try {
		const raw = sessionStorage.getItem(SNAPSHOT_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as Snapshot;
		if (typeof data.lectureId !== "string") return null;
		return { lectureId: data.lectureId, elapsedSec: Number(data.elapsedSec) || 0 };
	} catch {
		return null;
	}
}

function persistSnapshot(session: RecordSession): void {
	try {
		if (session.status === "idle" || !session.lectureId) {
			sessionStorage.removeItem(SNAPSHOT_KEY);
			return;
		}
		sessionStorage.setItem(
			SNAPSHOT_KEY,
			JSON.stringify({ lectureId: session.lectureId, elapsedSec: session.elapsedSec }),
		);
	} catch {
		// stockage indisponible
	}
}

function getRecordSession(): RecordSession {
	if (typeof document === "undefined") return new RecordSession();

	const g = globalThis as typeof globalThis & { __magiRecordSession?: RecordSession };
	if (!g.__magiRecordSession) g.__magiRecordSession = new RecordSession();
	return g.__magiRecordSession;
}

export function restoreRecordSession(): void {
	if (typeof document === "undefined") return;
	const session = getRecordSession();
	if (session.status !== "idle") return;
	const snap = readSnapshot();
	if (snap) session.attach(snap.lectureId, snap.elapsedSec);
}

export const recordSession: RecordSession = new Proxy({} as RecordSession, {
	get(_target, prop) {
		const session = getRecordSession();
		const value = Reflect.get(session, prop, session);
		return typeof value === "function" ? value.bind(session) : value;
	},
	set(_target, prop, value) {
		return Reflect.set(getRecordSession(), prop, value);
	},
});
