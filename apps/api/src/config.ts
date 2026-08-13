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
} as const;
