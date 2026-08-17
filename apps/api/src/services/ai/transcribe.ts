import { join } from "@std/path";

import { config } from "@/config.ts";
import * as storage from "@/services/storage.ts";

type WhisperXResult = {
	segments?: Array<{ text?: string }>;
};

function whisperxCommand(args: string[]): Deno.Command {
	const options: Deno.CommandOptions = {
		args,
		stdout: "piped",
		stderr: "piped",
	};

	if (Deno.build.os === "windows" && !/\.(exe|cmd|bat)$/i.test(config.whisperxBin)) {
		return new Deno.Command("cmd", { ...options, args: ["/c", config.whisperxBin, ...args] });
	}

	return new Deno.Command(config.whisperxBin, options);
}

export async function transcribe(lectureId: string): Promise<void> {
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
		"--no_align",
	];

	const { code, stderr } = await whisperxCommand(args).output();
	if (code !== 0) {
		throw new Error(`whisperx_exit_${code}: ${new TextDecoder().decode(stderr)}`);
	}

	const parsed = JSON.parse(await Deno.readTextFile(join(dir, "record.json"))) as WhisperXResult;
	const text = (parsed.segments ?? [])
		.map((segment) => segment.text?.trim() ?? "")
		.filter(Boolean)
		.join("\n");

	if (!text) throw new Error("empty_transcript");
	await Deno.writeTextFile(storage.transcriptPath(lectureId), text);
}
