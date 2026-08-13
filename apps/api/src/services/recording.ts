// ! Review this file

import { SessionStatus } from "@magi/shared/types/session";
import { Lecture } from "@/models/lecture.ts";
import { LectureTag } from "@/models/lecture-tag.ts";
import { config } from "@/config.ts";
import * as storage from "@/services/storage.ts";

const queues = new Map<string, Promise<unknown>>();
const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
	const previous = queues.get(key) ?? Promise.resolve();
	const result = previous.then(task, task);

	const tail = result.then(() => {}, () => {});
	queues.set(key, tail);
	tail.then(() => {
		if (queues.get(key) === tail) queues.delete(key);
	});

	return result;
}

function clearStalePause(lectureId: string): void {
	const timer = staleTimers.get(lectureId);
	if (!timer) return;
	clearTimeout(timer);
	staleTimers.delete(lectureId);
}

function armStalePause(lectureId: string): void {
	clearStalePause(lectureId);
	const timer = setTimeout(() => {
		staleTimers.delete(lectureId);
		void pauseIfStale(lectureId).catch((error) => console.error(error));
	}, config.staleChunkMs);
	staleTimers.set(lectureId, timer);
}

function pauseIfStale(lectureId: string): Promise<void> {
	return withLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture || lecture.status !== SessionStatus.RECORDING) return;

		const ref = lecture.lastChunkAt ?? lecture.createdAt;
		if (Date.now() - ref.getTime() < config.staleChunkMs) return;

		storage.closeLectureFiles(lecture.id);
		lecture.status = SessionStatus.PAUSED;
		await lecture.save();
	});
}

export type IngestResult =
	| { kind: "ok"; lecture: Lecture }
	| { kind: "duplicate"; lecture: Lecture }
	| { kind: "gap"; lecture: Lecture }
	| { kind: "wrong-segment"; lecture: Lecture }
	| { kind: "finished"; lecture: Lecture }
	| { kind: "not-found" };

export async function startLecture(input: {
	title?: string | null;
	subjectId?: string | null;
}): Promise<Lecture> {
	const lecture = await Lecture.create({
		title: input.title ?? null,
		subjectId: input.subjectId ?? null,
		status: SessionStatus.RECORDING,
		lastChunkAt: new Date(),
		durationSec: 0,
	});

	await storage.ensureLectureDir(lecture.id);
	armStalePause(lecture.id);

	return lecture;
}

export function ingestChunk(
	lectureId: string,
	segmentIndex: number,
	seq: number,
	data: Uint8Array,
): Promise<IngestResult> {
	return withLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture) return { kind: "not-found" };
		if (lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED) {
			return { kind: "finished", lecture };
		}
		if (segmentIndex !== lecture.segmentIndex) return { kind: "wrong-segment", lecture };
		if (seq <= (lecture.lastSeq ?? -1)) return { kind: "duplicate", lecture };
		if (seq > (lecture.lastSeq ?? -1) + 1) return { kind: "gap", lecture };

		await storage.appendChunk(lectureId, segmentIndex, data);

		lecture.lastSeq = seq;
		lecture.segmentBytes += data.byteLength;
		lecture.audioBytes = (lecture.audioBytes ?? 0) + data.byteLength;
		lecture.lastChunkAt = new Date();
		const live = lecture.status === SessionStatus.RECORDING;
		if (live) lecture.durationSec = (lecture.durationSec ?? 0) + Math.round(config.chunkMs / 1000);
		await lecture.save();
		if (live) armStalePause(lectureId);

		return { kind: "ok", lecture };
	});
}

export function openNextSegment(
	lectureId: string,
): Promise<{ kind: "ok"; lecture: Lecture } | { kind: "finished"; lecture: Lecture } | { kind: "not-found" }> {
	return withLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture) return { kind: "not-found" as const };
		if (lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED) {
			return { kind: "finished" as const, lecture };
		}

		storage.closeLectureFiles(lectureId);

		lecture.segmentIndex += 1;
		lecture.segmentBytes = 0;
		lecture.lastSeq = -1;
		await lecture.save();

		return { kind: "ok" as const, lecture };
	});
}

export function setPaused(
	lectureId: string,
	paused: boolean,
	durationSec?: number,
): Promise<{ kind: "ok"; lecture: Lecture } | { kind: "finished"; lecture: Lecture } | { kind: "not-found" }> {
	return withLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture) return { kind: "not-found" as const };
		if (lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED) {
			return { kind: "finished" as const, lecture };
		}

		lecture.status = paused ? SessionStatus.PAUSED : SessionStatus.RECORDING;
		if (!paused) lecture.lastChunkAt = new Date();
		if (paused && durationSec != null) lecture.durationSec = durationSec;
		await lecture.save();

		if (paused) clearStalePause(lectureId);
		else armStalePause(lectureId);

		return { kind: "ok" as const, lecture };
	});
}

export function stopLecture(
	lectureId: string,
	durationSec?: number,
): Promise<{ kind: "ok"; lecture: Lecture } | { kind: "not-found" }> {
	return withLock(lectureId, async () => {
		const lecture = await Lecture.findByPk(lectureId);
		if (!lecture) return { kind: "not-found" as const };
		if (lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED) {
			return { kind: "ok" as const, lecture };
		}

		storage.closeLectureFiles(lectureId);

		lecture.durationSec = durationSec ?? 0;
		lecture.status = SessionStatus.PROCESSING;
		await lecture.save();

		clearStalePause(lectureId);

		return { kind: "ok" as const, lecture };
	});
}

export function uploadState(lecture: Lecture) {
	return {
		status: lecture.status,
		finished: lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED,
		segmentIndex: lecture.segmentIndex,
		nextSeq: (lecture.lastSeq ?? -1) + 1,
		segmentBytes: lecture.segmentBytes,
		audioBytes: lecture.audioBytes,
		durationSec: lecture.durationSec,
		maxChunkBytes: config.maxChunkBytes,
		chunkMs: config.chunkMs,
	};
}

export async function pauseOrphanedRecordings(): Promise<void> {
	const active = await Lecture.findAll({ where: { status: SessionStatus.RECORDING } });
	for (const lecture of active) {
		storage.closeLectureFiles(lecture.id);
		lecture.status = SessionStatus.PAUSED;
		await lecture.save();
	}
}

export async function deleteLecture(lectureId: string): Promise<void> {
	await withLock(lectureId, async () => {
		clearStalePause(lectureId);
		await storage.removeLectureDir(lectureId);
		await LectureTag.destroy({ where: { lectureId } });
		await Lecture.destroy({ where: { id: lectureId } });
	});
}
