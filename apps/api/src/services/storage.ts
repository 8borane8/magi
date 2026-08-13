import { patchWebmHeaders } from "@/utils/webm-duration.ts";
import { config } from "@/config.ts";
import { join } from "@std/path";

type OpenRecord = {
	file: Deno.FsFile;
	idleTimer: ReturnType<typeof setTimeout> | null;
};

const openRecords = new Map<string, OpenRecord>();

function lectureDir(lectureId: string): string {
	return join(config.lecturesDir, lectureId);
}

function recordPath(lectureId: string): string {
	return join(lectureDir(lectureId), "record.webm");
}

export async function ensureLectureDir(lectureId: string): Promise<void> {
	await Deno.mkdir(lectureDir(lectureId), { recursive: true });
}

export function isOutOfSpace(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /no space left|not enough space|os error 28|os error 112/i.test(message);
}

async function acquire(lectureId: string): Promise<Deno.FsFile> {
	const cached = openRecords.get(lectureId);

	if (cached) {
		scheduleClose(lectureId, cached);
		return cached.file;
	}

	await ensureLectureDir(lectureId);
	const file = await Deno.open(recordPath(lectureId), { create: true, append: true });

	const entry: OpenRecord = { file, idleTimer: null };
	openRecords.set(lectureId, entry);
	scheduleClose(lectureId, entry);

	return file;
}

function scheduleClose(lectureId: string, entry: OpenRecord): void {
	if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);

	entry.idleTimer = setTimeout(() => {
		openRecords.delete(lectureId);
		try {
			entry.file.close();
		} catch {
			// Already closed by a concurrent stop.
		}
	}, config.idleFileTtlMs);

	Deno.unrefTimer(entry.idleTimer);
}

export async function appendChunk(lectureId: string, data: Uint8Array): Promise<void> {
	const file = await acquire(lectureId);

	let written = 0;
	while (written < data.length) {
		written += await file.write(data.subarray(written));
	}

	await file.sync();
}

export async function finalizeRecord(lectureId: string, durationMs: number): Promise<void> {
	closeLectureFiles(lectureId);

	const path = recordPath(lectureId);
	const data = await Deno.readFile(path);
	if (!patchWebmHeaders(data, durationMs)) return;
	await Deno.writeFile(path, data);
}

export function closeLectureFiles(lectureId: string): void {
	const entry = openRecords.get(lectureId);
	if (!entry) return;

	if (entry.idleTimer !== null) clearTimeout(entry.idleTimer);
	openRecords.delete(lectureId);
	try {
		entry.file.close();
	} catch {
		// Already closed.
	}
}

export async function removeLectureDir(lectureId: string): Promise<void> {
	closeLectureFiles(lectureId);

	try {
		await Deno.remove(lectureDir(lectureId), { recursive: true });
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
	}
}
