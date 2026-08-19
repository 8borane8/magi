import { join, resolve } from "@std/path";

const dataDir = resolve(Deno.env.get("MAGI_DATA_DIR") || "./data");

export const config = {
	dataDir,
	lecturesDir: join(dataDir, "lectures"),
	databasePath: join(dataDir, "database.sqlite"),

	chunkMs: 5000,
	maxChunkBytes: 16 * 1024 * 1024,
	idleFileTtlMs: 2 * 60 * 1000,
	staleChunkMs: 15_000,

	maxChatFiles: 4,
	maxChatFileBytes: 5 * 1024 * 1024,

	ollamaUrl: Deno.env.get("OLLAMA_URL") || "http://127.0.0.1:11434",
	ollamaChatModel: Deno.env.get("OLLAMA_CHAT_MODEL") || "llama3.2",
	ollamaVisionModel: Deno.env.get("OLLAMA_VISION_MODEL") || "llava",
	ollamaTimeoutMs: 30 * 60 * 1000,

	whisperxBin: Deno.env.get("WHISPERX_BIN") || "whisperx",
	whisperxModel: Deno.env.get("WHISPERX_MODEL") || "large-v2",
	whisperxLanguage: Deno.env.get("WHISPERX_LANGUAGE") || "fr",
	whisperxDevice: Deno.env.get("WHISPERX_DEVICE") || "cuda",
	whisperxComputeType: Deno.env.get("WHISPERX_COMPUTE_TYPE") || "float16",
	hfToken: Deno.env.get("HF_TOKEN") || "",
} as const;
