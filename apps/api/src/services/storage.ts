// ! Review this file

import { join } from "@std/path";

import { config } from "@/config.ts";

type OpenSegment = {
	file: Deno.FsFile;
	idleTimer: ReturnType<typeof setTimeout> | null;
};

const openSegments = new Map<string, OpenSegment>();

export function lectureDir(lectureId: string): string {
	return join(config.lecturesDir, lectureId);
}

export function segmentPath(lectureId: string, segmentIndex: number): string {
	return join(lectureDir(lectureId), `part-${String(segmentIndex).padStart(4, "0")}.webm`);
}

export async function ensureLectureDir(lectureId: string): Promise<void> {
	await Deno.mkdir(lectureDir(lectureId), { recursive: true });
}

/** Tells a full disk from a real failure, so the route can answer 507 instead of 500. */
export function isOutOfSpace(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /no space left|not enough space|os error 28|os error 112/i.test(message);
}

async function acquire(lectureId: string, segmentIndex: number): Promise<Deno.FsFile> {
	const key = `${lectureId}:${segmentIndex}`;
	const cached = openSegments.get(key);

	if (cached) {
		scheduleClose(key, cached);
		return cached.file;
	}

	await ensureLectureDir(lectureId);
	const file = await Deno.open(segmentPath(lectureId, segmentIndex), { create: true, append: true });

	const entry: OpenSegment = { file, idleTimer: null };
	openSegments.set(key, entry);
	scheduleClose(key, entry);

	return file;
}

/** Releases the descriptor a client left behind when it disappeared mid recording. */
function scheduleClose(key: string, entry: OpenSegment): void {
	if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);

	entry.idleTimer = setTimeout(() => {
		openSegments.delete(key);
		try {
			entry.file.close();
		} catch {
			// Already closed by a concurrent stop.
		}
	}, config.idleFileTtlMs);

	Deno.unrefTimer(entry.idleTimer as unknown as number);
}

/**
 * Appends a chunk and flushes it to the disk.
 *
 * The flush happens before the caller records the new position in database: if the node dies in
 * between, the file holds more bytes than the database, which recovery repairs by truncating. The
 * opposite order would lose audio without anyone noticing.
 */
export async function appendChunk(lectureId: string, segmentIndex: number, data: Uint8Array): Promise<void> {
	const file = await acquire(lectureId, segmentIndex);

	let written = 0;
	while (written < data.length) {
		written += await file.write(data.subarray(written));
	}

	await file.sync();
}

export function closeLectureFiles(lectureId: string): void {
	for (const [key, entry] of openSegments) {
		if (!key.startsWith(`${lectureId}:`)) continue;

		if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
		openSegments.delete(key);
		try {
			entry.file.close();
		} catch {
			// Already closed.
		}
	}
}

export async function segmentSize(lectureId: string, segmentIndex: number): Promise<number | null> {
	try {
		const stat = await Deno.stat(segmentPath(lectureId, segmentIndex));
		return stat.size;
	} catch {
		return null;
	}
}

export async function truncateSegment(lectureId: string, segmentIndex: number, bytes: number): Promise<void> {
	await Deno.truncate(segmentPath(lectureId, segmentIndex), bytes);
}

export async function removeLectureDir(lectureId: string): Promise<void> {
	closeLectureFiles(lectureId);

	try {
		await Deno.remove(lectureDir(lectureId), { recursive: true });
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
}
