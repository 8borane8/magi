import { Router } from "@webtools/expressapi";

import { config } from "@/config.ts";

export default new Router()
	.get("/health", (_req, res) =>
		res.json({
			success: true as const,
			data: {
				service: "magi-node",
				uptimeSec: process.uptime(),
				chunkMs: config.chunkMs,
				maxChunkBytes: config.maxChunkBytes,
				idleFileTtlMs: config.idleFileTtlMs,
				staleChunkMs: config.staleChunkMs,
			},
		}));
