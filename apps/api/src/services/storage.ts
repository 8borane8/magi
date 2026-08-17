import { patchWebmHeaders } from "@/utils/webm-duration.ts";
import { config } from "@/config.ts";
import { join } from "@std/path";

type OpenRecord = {
	file: Deno.FsFile;
	idleTimer: ReturnType<typeof setTimeout> | null;
};

const openRecords = new Map<string, OpenRecord>();

export function lectureDir(lectureId: string): string {
	return join(config.lecturesDir, lectureId);
}

function chatDir(lectureId: string): string {
	return join(lectureDir(lectureId), "chat");
}

export function chatFilePath(lectureId: string, fileName: string): string {
	return join(chatDir(lectureId), fileName);
}

export function recordPath(lectureId: string): string {
	return join(lectureDir(lectureId), "record.webm");
}

export function transcriptPath(lectureId: string): string {
	return join(lectureDir(lectureId), "transcript.txt");
}

export function resumePath(lectureId: string): string {
	return join(lectureDir(lectureId), "resume.md");
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

const IMAGE_EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
};

export async function saveChatImage(lectureId: string, file: File): Promise<string> {
	const ext = IMAGE_EXT[file.type];
	if (!ext) throw new Error("unsupported_image");

	const fileName = `${crypto.randomUUID()}.${ext}`;
	await Deno.mkdir(chatDir(lectureId), { recursive: true });
	await Deno.writeFile(chatFilePath(lectureId, fileName), new Uint8Array(await file.arrayBuffer()));
	return fileName;
}

export function isSafeChatFileName(fileName: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i.test(fileName);
}

export async function removeChatDir(lectureId: string): Promise<void> {
	try {
		await Deno.remove(chatDir(lectureId), { recursive: true });
	} catch (error) {
		if (!(error instanceof Deno.errors.NotFound)) throw error;
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
