import { Router, z } from "@webtools/expressapi";

import { SessionStatus } from "@magi/shared/types/session";
import * as recording from "@/services/recording.ts";
import * as storage from "@/services/storage.ts";
import { Lecture } from "@/models/lecture.ts";
import { config } from "@/config.ts";

export default new Router()
	.post("/", async (_req, res) => {
		const lecture = await Lecture.create();

		await storage.ensureLectureDir(lecture.id);
		recording.armStalePause(lecture.id);

		return res.json({
			success: true,
			data: {
				lecture: lecture.toJSON(),
				upload: recording.uploadState(lecture),
			},
		});
	})
	.post(
		"/:lectureId/chunks/:seq",
		async (req, res) => {
			const data = req.body;

			if (!(data instanceof ArrayBuffer)) {
				return res.status(415).json({
					success: false,
					error: "binary_body_required",
				});
			}
			if (data.byteLength === 0) {
				return res.status(400).json({
					success: false,
					error: "empty_chunk",
				});
			}
			if (data.byteLength > config.maxChunkBytes) {
				return res.status(413).json({
					success: false,
					error: "chunk_too_large",
				});
			}

			try {
				const result = await recording.ingestChunk(
					req.params.lectureId,
					req.params.seq,
					new Uint8Array(data),
				);

				switch (result.kind) {
					case "ok":
						return res.json({
							success: true,
							data: recording.uploadState(result.lecture),
						});

					case "duplicate":
						return res.status(409).json({
							success: false,
							error: "sequence_duplicate",
							data: recording.uploadState(result.lecture),
						});

					case "gap":
						return res.status(409).json({
							success: false,
							error: "sequence_gap",
							data: recording.uploadState(result.lecture),
						});

					case "finished":
						return res.status(409).json({
							success: false,
							error: "lecture_finished",
						});

					default:
						return res.status(404).json({
							success: false,
							error: "404 Not Found.",
						});
				}
			} catch (error) {
				if (storage.isOutOfSpace(error)) {
					return res.status(507).json({
						success: false,
						error: "insufficient_storage",
					});
				}
				throw error;
			}
		},
		[],
		{
			params: z.object({
				lectureId: z.string(),
				seq: z.number().int().min(0),
			}),
		},
	)
	.post("/:lectureId/pause", async (req, res) => {
		const result = await recording.setPaused(req.params.lectureId, true);

		if (result.kind === "not-found") {
			return res.status(404).json({
				success: false,
				error: "404 Not Found.",
			});
		}
		if (result.kind === "finished") {
			return res.status(409).json({
				success: false,
				error: "lecture_finished",
			});
		}

		return res.json({
			success: true,
			data: recording.uploadState(result.lecture),
		});
	})
	.post("/:lectureId/resume", async (req, res) => {
		const result = await recording.setPaused(req.params.lectureId, false);

		if (result.kind === "not-found") {
			return res.status(404).json({
				success: false,
				error: "404 Not Found.",
			});
		}
		if (result.kind === "finished") {
			return res.status(409).json({
				success: false,
				error: "lecture_finished",
			});
		}

		return res.json({
			success: true,
			data: recording.uploadState(result.lecture),
		});
	})
	.post("/:lectureId/stop", async (req, res) => {
		const { lectureId } = req.params;
		const result = await recording.withLectureLock(lectureId, async () => {
			const lecture = await Lecture.findByPk(lectureId);
			if (!lecture) return { kind: "not-found" };
			if (lecture.status !== SessionStatus.RECORDING && lecture.status !== SessionStatus.PAUSED) {
				return { kind: "ok" };
			}

			recording.clearStalePause(lectureId);
			await storage.finalizeRecord(lectureId, lecture.audioMs);
			await lecture.update({ status: SessionStatus.PROCESSING });

			return { kind: "ok" };
		});

		if (result.kind === "not-found") {
			return res.status(404).json({
				success: false,
				error: "404 Not Found.",
			});
		}

		return res.json({ success: true });
	})
	.delete("/:lectureId", async (req, res) => {
		const { lectureId } = req.params;
		const result = await recording.withLectureLock(lectureId, async () => {
			const lecture = await Lecture.findByPk(lectureId);
			if (!lecture) return { kind: "not-found" };

			recording.clearStalePause(lectureId);
			await storage.removeLectureDir(lectureId);
			await lecture.destroy();

			return { kind: "ok" };
		});

		if (result.kind === "not-found") {
			return res.status(404).json({
				success: false,
				error: "404 Not Found.",
			});
		}

		return res.json({ success: true });
	});
