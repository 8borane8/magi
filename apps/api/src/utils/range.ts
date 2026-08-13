// ! Review this file

export type ByteRange = { start: number; end: number };

/**
 * Reads a single range header, which is all an audio player needs to seek.
 * Returns null when the client wants the whole file, "invalid" when the range is unusable.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
	if (!header) return null;

	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return "invalid";

	const [, rawStart, rawEnd] = match;
	if (rawStart === "" && rawEnd === "") return "invalid";

	let start: number;
	let end: number;

	if (rawStart === "") {
		const suffixLength = Number(rawEnd);
		if (suffixLength <= 0) return "invalid";
		start = Math.max(0, size - suffixLength);
		end = size - 1;
	} else {
		start = Number(rawStart);
		end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
	}

	if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
	if (start > end || start >= size) return "invalid";

	return { start, end };
}

/** Bounded stream: file.readable would run to the end of the file and break the 206 response. */
export function limitedStream(file: Deno.FsFile, length: number): ReadableStream<Uint8Array> {
	let remaining = length;

	return new ReadableStream({
		async pull(controller) {
			if (remaining <= 0) {
				controller.close();
				file.close();
				return;
			}

			const buffer = new Uint8Array(Math.min(64 * 1024, remaining));
			const read = await file.read(buffer);

			if (read === null) {
				controller.close();
				file.close();
				return;
			}

			remaining -= read;
			controller.enqueue(buffer.subarray(0, read));
		},
		cancel() {
			file.close();
		},
	});
}
