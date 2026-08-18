import { scanWebmChunkDurationMs, stripWebmInit } from "@/utils/webm-duration.ts";
import { SessionStatus } from "@magi/shared/types/session";
import { Lecture } from "@/models/lecture.ts";
import { config } from "@/config.ts";
import * as storage from "@/services/storage.ts";

const queues = new Map<string, Promise<unknown>>();
const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const jobs = new Map<string, Promise<void>>();

export function withLectureLock<T>(lectureId: string, task: () => Promise<T>): Promise<T> {
	const previous = queues.get(lectureId) || Promise.resolve();
	const result = previous.then(task, task);

	const tail = result.then(() => {}, () => {});
	queues.set(lectureId, tail);
	tail.then(() => {
		if (queues.get(lectureId) === tail) queues.delete(lectureId);
	});

	return result;
}

export function runProcess(lectureId: string, task: () => Promise<void>): void {
	if (jobs.has(lectureId)) return;
	const run = task();
	jobs.set(lectureId, run);
	void run.finally(() => {
		if (jobs.get(lectureId) === run) jobs.delete(lectureId);
	});
}

export function whenProcessed(lectureId: string): Promise<void> {
	return jobs.get(lectureId) || Promise.resolve();
}

export function clearStalePause(lectureId: string): void {
	const timer = staleTimers.get(lectureId);
	if (!timer) return;
	clearTimeout(timer);
	staleTimers.delete(lectureId);
}

function staleRemainingMs(lecture: Lecture): number {
	const ref = lecture.lastChunkAt || lecture.createdAt;
	return config.staleChunkMs - (Date.now() - ref.getTime());
}

export function armStalePause(lectureId: string, delayMs: number = config.staleChunkMs): void {
	clearStalePause(lectureId);
	const timer = setTimeout(() => {
		staleTimers.delete(lectureId);
		void pauseIfStale(lectureId).catch((error) => console.error(error));
	}, delayMs);
	Deno.unrefTimer(timer);
	staleTimers.set(lectureId, timer);
}

export async function failStaleProcessing(): Promise<void> {
	await Lecture.update({ status: SessionStatus.FAILED }, { where: { status: SessionStatus.PROCESSING } });
}

export async function resumeStaleWatch(): Promise<void> {
	const live = await Lecture.findAll({ where: { status: SessionStatus.RECORDING } });
	for (const lecture of live) {
		armStalePause(lecture.id, Math.max(0, staleRemainingMs(lecture)));
	}
}

function pauseIfStale(lectureId: string): Promise<void> {
	return withLectureLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture || lecture.status !== SessionStatus.RECORDING) return;

		const remaining = staleRemainingMs(lecture);
		if (remaining > 0) {
			armStalePause(lectureId, remaining);
			return;
		}

		storage.closeLectureFiles(lecture.id);
		lecture.status = SessionStatus.PAUSED;
		await lecture.save();
	});
}

type IngestResult =
	| { kind: "ok" }
	| { kind: "duplicate" }
	| { kind: "gap" }
	| { kind: "finished" }
	| { kind: "not-found" };

export function ingestChunk(
	lectureId: string,
	seq: number,
	data: Uint8Array,
): Promise<IngestResult> {
	return withLectureLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture) return { kind: "not-found" };
		if (lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED) {
			return { kind: "finished" };
		}
		const lastSeq = lecture.lastSeq ?? -1;
		if (seq <= lastSeq) return { kind: "duplicate" };
		if (seq > lastSeq + 1) return { kind: "gap" };

		const payload = lecture.audioBytes > 0 ? stripWebmInit(data) : data;
		await storage.appendChunk(lectureId, payload);

		lecture.lastSeq = seq;
		lecture.audioMs += scanWebmChunkDurationMs(payload) || config.chunkMs;
		lecture.audioBytes += payload.byteLength;
		lecture.lastChunkAt = new Date();

		const live = lecture.status === SessionStatus.RECORDING;
		await lecture.save();
		if (live) armStalePause(lectureId);

		return { kind: "ok" };
	});
}
