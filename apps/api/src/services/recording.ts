import { scanWebmChunkDurationMs, stripWebmInit } from "@/utils/webm-duration.ts";
import { SessionStatus } from "@magi/shared/types/session";
import { Lecture } from "@/models/lecture.ts";
import { config } from "@/config.ts";
import * as storage from "@/services/storage.ts";

const queues = new Map<string, Promise<unknown>>();
const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function withLectureLock<T>(lectureId: string, task: () => Promise<T>): Promise<T> {
	const previous = queues.get(lectureId) ?? Promise.resolve();
	const result = previous.then(task, task);

	const tail = result.then(() => {}, () => {});
	queues.set(lectureId, tail);
	tail.then(() => {
		if (queues.get(lectureId) === tail) queues.delete(lectureId);
	});

	return result;
}

export function clearStalePause(lectureId: string): void {
	const timer = staleTimers.get(lectureId);
	if (!timer) return;
	clearTimeout(timer);
	staleTimers.delete(lectureId);
}

export function armStalePause(lectureId: string): void {
	clearStalePause(lectureId);
	const timer = setTimeout(() => {
		staleTimers.delete(lectureId);
		void pauseIfStale(lectureId).catch((error) => console.error(error));
	}, config.staleChunkMs);
	Deno.unrefTimer(timer);
	staleTimers.set(lectureId, timer);
}

function pauseIfStale(lectureId: string): Promise<void> {
	return withLectureLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture || lecture.status !== SessionStatus.RECORDING) return;

		const ref = lecture.lastChunkAt || lecture.createdAt;
		if (Date.now() - ref.getTime() < config.staleChunkMs) return;

		storage.closeLectureFiles(lecture.id);
		lecture.status = SessionStatus.PAUSED;
		await lecture.save();
	});
}

type IngestResult =
	| { kind: "ok"; lecture: Lecture }
	| { kind: "duplicate"; lecture: Lecture }
	| { kind: "gap"; lecture: Lecture }
	| { kind: "finished"; lecture: Lecture }
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
			return { kind: "finished", lecture };
		}
		const lastSeq = lecture.lastSeq ?? -1;
		if (seq <= lastSeq) return { kind: "duplicate", lecture };
		if (seq > lastSeq + 1) return { kind: "gap", lecture };

		const payload = lecture.audioBytes > 0 ? stripWebmInit(data) : data;
		await storage.appendChunk(lectureId, payload);

		lecture.lastSeq = seq;
		lecture.audioMs += scanWebmChunkDurationMs(payload) ?? config.chunkMs;
		lecture.audioBytes += payload.byteLength;
		lecture.lastChunkAt = new Date();

		const live = lecture.status === SessionStatus.RECORDING;
		await lecture.save();
		if (live) armStalePause(lectureId);

		return { kind: "ok", lecture };
	});
}

type PauseResult =
	| { kind: "not-found" }
	| { kind: "finished" }
	| { kind: "ok"; lecture: Lecture };

export function setPaused(lectureId: string, paused: boolean): Promise<PauseResult> {
	return withLectureLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture) return { kind: "not-found" };
		if (lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED) {
			return { kind: "finished" };
		}

		if (paused) storage.closeLectureFiles(lectureId);

		await lecture.update({
			status: paused ? SessionStatus.PAUSED : SessionStatus.RECORDING,
		});

		if (paused) clearStalePause(lectureId);
		else armStalePause(lectureId);

		return { kind: "ok", lecture };
	});
}

export function uploadState(lecture: Lecture) {
	return {
		status: lecture.status,
		finished: lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED,
		nextSeq: (lecture.lastSeq ?? -1) + 1,
		audioBytes: lecture.audioBytes,
		audioMs: lecture.audioMs,
		maxChunkBytes: config.maxChunkBytes,
		chunkMs: config.chunkMs,
	};
}
