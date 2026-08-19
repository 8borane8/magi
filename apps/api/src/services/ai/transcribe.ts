import { join } from "@std/path";

import { config } from "@/config.ts";
import * as storage from "@/services/storage.ts";

type WhisperXSegment = {
	text?: string;
	speaker?: string;
};

type WhisperXResult = {
	segments?: WhisperXSegment[];
};

function whisperxCommand(args: string[]): Deno.Command {
	const options: Deno.CommandOptions = {
		args,
		stdout: "inherit",
		stderr: "inherit",
	};

	if (Deno.build.os === "windows" && !/\.(exe|cmd|bat)$/i.test(config.whisperxBin)) {
		return new Deno.Command("cmd", { ...options, args: ["/c", config.whisperxBin, ...args] });
	}

	return new Deno.Command(config.whisperxBin, options);
}

function formatTranscript(segments: WhisperXSegment[]): string {
	const blocks: Array<{ speaker: string; text: string }> = [];

	for (const segment of segments) {
		const text = segment.text?.trim();
		if (!text) continue;

		const speaker = segment.speaker || "";
		const last = blocks.at(-1);
		if (last && last.speaker === speaker) {
			last.text += ` ${text}`;
		} else {
			blocks.push({ speaker, text });
		}
	}

	return blocks
		.map((block) => (block.speaker ? `[${block.speaker}] ${block.text}` : block.text))
		.join("\n");
}

export async function transcribe(lectureId: string): Promise<void> {
	if (!config.hfToken) throw new Error("hf_token_required");

	const dir = storage.lectureDir(lectureId);
	const args = [
		storage.recordPath(lectureId),
		"--model",
		config.whisperxModel,
		"--language",
		config.whisperxLanguage,
		"--device",
		config.whisperxDevice,
		"--compute_type",
		config.whisperxComputeType,
		"--output_dir",
		dir,
		"--output_format",
		"json",
		"--diarize",
		"--hf_token",
		config.hfToken,
	];

	const status = await whisperxCommand(args).spawn().status;
	if (!status.success) {
		throw new Error(`whisperx_exit_${status.code}`);
	}

	const parsed = JSON.parse(await Deno.readTextFile(join(dir, "record.json"))) as WhisperXResult;
	const text = formatTranscript(parsed.segments || []);

	if (!text) throw new Error("empty_transcript");
	await Deno.writeTextFile(storage.transcriptPath(lectureId), text);
}
