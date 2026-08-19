import { scanWebmChunkDurationMs, stripWebmInit } from "@/utils/webm-duration.ts";
import { SessionStatus } from "@magi/shared/types/session";
import { Lecture } from "@/models/lecture.ts";
import { config } from "@/config.ts";
import * as storage from "@/services/storage.ts";

const queues = new Map<string, Promise<unknown>>();
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
	const run = Promise.resolve().then(task);
	jobs.set(lectureId, run);
	void run.finally(() => {
		if (jobs.get(lectureId) === run) jobs.delete(lectureId);
	});
}

function isStale(lecture: Lecture): boolean {
	const ref = lecture.lastChunkAt || lecture.createdAt;
	return Date.now() - ref.getTime() >= config.staleChunkMs;
}

async function pauseStaleRecordings(): Promise<void> {
	const live = await Lecture.findAll({ where: { status: SessionStatus.RECORDING } });
	for (const lecture of live) {
		if (!isStale(lecture)) continue;
		await withLectureLock(lecture.id, async () => {
			await lecture.reload();
			if (lecture.status !== SessionStatus.RECORDING || !isStale(lecture)) return;
			storage.closeLectureFiles(lecture.id);
			lecture.status = SessionStatus.PAUSED;
			await lecture.save();
		});
	}
}

export async function failStaleProcessing(): Promise<void> {
	await Lecture.update({
		status: SessionStatus.FAILED,
		processStage: null,
	}, { where: { status: SessionStatus.PROCESSING } });
}

export function startStaleWatch(): void {
	void pauseStaleRecordings().catch((error) => console.error(error));
	const timer = setInterval(() => {
		void pauseStaleRecordings().catch((error) => console.error(error));
	}, 5_000);
	Deno.unrefTimer(timer);
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

		await lecture.save();
		return { kind: "ok" };
	});
}
