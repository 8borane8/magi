// Fully ai generated i have no idea what this does

const EBML = 0x1A45DFA3;
const SEGMENT = 0x18538067;
const INFO = 0x1549A966;
const TIMECODE_SCALE = 0x2AD7B1;
const DURATION = 0x4489;
const CLUSTER = 0x1F43B675;
const BLOCK_GROUP = 0xA0;
const SIMPLE_BLOCK = 0xA3;
const BLOCK = 0xA1;
const OPUS_FRAME_MS = 20;
const DEFAULT_SCALE = 1_000_000;

function readId(data: Uint8Array, pos: number): { value: number; next: number } | null {
	if (pos >= data.length || data[pos] === 0) return null;

	let mask = 0x80;
	let len = 1;
	while (len <= 4 && (data[pos] & mask) === 0) {
		mask >>= 1;
		len++;
	}
	if (len > 4 || pos + len > data.length) return null;

	let value = 0;
	for (let i = 0; i < len; i++) value = value * 256 + data[pos + i];
	return { value, next: pos + len };
}

function readSize(
	data: Uint8Array,
	pos: number,
): { value: number; next: number; unknown: boolean; bytes: number } | null {
	if (pos >= data.length || data[pos] === 0) return null;

	let mask = 0x80;
	let len = 1;
	while (len <= 8 && (data[pos] & mask) === 0) {
		mask >>= 1;
		len++;
	}
	if (pos + len > data.length) return null;

	let value = data[pos] & (mask - 1);
	let unknown = value === mask - 1;
	for (let i = 1; i < len; i++) {
		value = value * 256 + data[pos + i];
		if (data[pos + i] !== 0xFF) unknown = false;
	}

	return { value, next: pos + len, unknown, bytes: len };
}

function writeSize(data: Uint8Array, pos: number, bytes: number, value: number): void {
	let n = value;
	for (let i = bytes - 1; i >= 1; i--) {
		data[pos + i] = n & 0xFF;
		n = Math.floor(n / 256);
	}
	data[pos] = (1 << (8 - bytes)) | (n & ((1 << (8 - bytes)) - 1));
}

function blockFrames(data: Uint8Array, start: number, end: number): number {
	const track = readSize(data, start);
	if (!track) return 1;

	const flags = track.next + 2;
	if (flags >= end || (data[flags] & 0x06) === 0) return 1;

	const count = flags + 1;
	return count < end ? data[count] + 1 : 1;
}

function countFrames(data: Uint8Array, start: number, end: number): number {
	let pos = start;
	let frames = 0;

	while (pos < end) {
		const id = readId(data, pos);
		if (!id) break;
		const size = readSize(data, id.next);
		if (!size) break;

		if (size.unknown) {
			if (id.value !== SEGMENT && id.value !== CLUSTER) break;
			pos = size.next;
			continue;
		}

		const bodyEnd = size.next + size.value;
		if (bodyEnd > end) break;

		if (id.value === SIMPLE_BLOCK || id.value === BLOCK) {
			frames += blockFrames(data, size.next, bodyEnd);
		} else if (id.value === SEGMENT || id.value === CLUSTER || id.value === BLOCK_GROUP) {
			frames += countFrames(data, size.next, bodyEnd);
		}

		pos = bodyEnd;
	}

	return frames;
}

/** Duration of one MediaRecorder chunk, from its Opus frames. */
export function scanWebmChunkDurationMs(data: Uint8Array): number | null {
	if (!data.length) return null;
	const frames = countFrames(data, 0, data.length);
	return frames > 0 ? frames * OPUS_FRAME_MS : null;
}

/** A new MediaRecorder after resume starts with a full EBML header. Keep clusters only. */
export function stripWebmInit(data: Uint8Array): Uint8Array {
	const first = readId(data, 0);
	if (!first || first.value !== EBML) return data;

	let pos = 0;
	while (pos < data.length) {
		const id = readId(data, pos);
		if (!id) break;
		if (id.value === CLUSTER) return data.subarray(pos);

		const size = readSize(data, id.next);
		if (!size) break;
		if (size.unknown) {
			if (id.value !== SEGMENT) break;
			pos = size.next;
			continue;
		}
		pos = size.next + size.value;
	}

	return data;
}

/**
 * Chrome leaves Duration at 0 and the Segment size unknown, so players treat
 * the file as a live stream and never show a total time.
 */
export function patchWebmHeaders(data: Uint8Array, durationMs: number): boolean {
	let pos = 0;

	while (pos < data.length) {
		const id = readId(data, pos);
		if (!id) break;
		const size = readSize(data, id.next);
		if (!size) break;

		if (id.value === SEGMENT) {
			if (size.bytes >= 4) writeSize(data, id.next, size.bytes, data.length - size.next);
			return patchInfo(data, size.next, size.unknown ? data.length : size.next + size.value, durationMs);
		}

		if (size.unknown) break;
		pos = size.next + size.value;
	}

	return false;
}

function patchInfo(data: Uint8Array, start: number, end: number, durationMs: number): boolean {
	let pos = start;
	let scale = DEFAULT_SCALE;
	let durationAt: { offset: number; bytes: number } | null = null;

	while (pos < end) {
		const id = readId(data, pos);
		if (!id) break;
		const size = readSize(data, id.next);
		if (!size || size.unknown) break;

		const bodyEnd = size.next + size.value;
		if (bodyEnd > end) break;

		if (id.value === INFO) {
			let inner = size.next;
			while (inner < bodyEnd) {
				const child = readId(data, inner);
				if (!child) break;
				const childSize = readSize(data, child.next);
				if (!childSize || childSize.unknown) break;
				const childEnd = childSize.next + childSize.value;
				if (childEnd > bodyEnd) break;

				if (child.value === TIMECODE_SCALE) {
					scale = 0;
					for (let i = childSize.next; i < childEnd; i++) scale = scale * 256 + data[i];
					if (!scale) scale = DEFAULT_SCALE;
				} else if (child.value === DURATION) {
					durationAt = { offset: childSize.next, bytes: childSize.value };
				}

				inner = childEnd;
			}
			break;
		}

		if (id.value === CLUSTER) break;
		pos = bodyEnd;
	}

	if (!durationAt || (durationAt.bytes !== 4 && durationAt.bytes !== 8)) return false;

	const view = new DataView(data.buffer, data.byteOffset + durationAt.offset, durationAt.bytes);
	const value = durationMs * DEFAULT_SCALE / scale;
	if (durationAt.bytes === 4) view.setFloat32(0, value);
	else view.setFloat64(0, value);
	return true;
}
