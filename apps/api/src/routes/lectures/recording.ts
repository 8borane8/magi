import { Router, z } from "@webtools/expressapi";

import { SessionStatus } from "@magi/shared/types/session";
import * as recording from "@/services/recording.ts";
import * as storage from "@/services/storage.ts";
import type { Lecture } from "@/models/lecture.ts";
import { config } from "@/config.ts";
import * as ai from "@/services/ai/index.ts";

function isLive(status: SessionStatus): boolean {
	return [SessionStatus.RECORDING, SessionStatus.PAUSED].includes(status);
}

async function setPaused(lecture: Lecture, paused: boolean): Promise<void> {
	await recording.withLectureLock(lecture.id, async () => {
		if (!isLive(lecture.status)) return;
		if (paused) storage.closeLectureFiles(lecture.id);

		await lecture.update({
			status: paused ? SessionStatus.PAUSED : SessionStatus.RECORDING,
		});

		if (paused) recording.clearStalePause(lecture.id);
		else recording.armStalePause(lecture.id);
	});
}

export default new Router<{ lecture: Lecture }>()
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
					req.data.lecture.id,
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
		await setPaused(req.data.lecture, true);
		return res.json({ success: true });
	})
	.post("/:lectureId/resume", async (req, res) => {
		await setPaused(req.data.lecture, false);
		return res.json({ success: true });
	})
	.post("/:lectureId/stop", async (req, res) => {
		const lecture = req.data.lecture;

		await recording.withLectureLock(lecture.id, async () => {
			recording.clearStalePause(lecture.id);
			await storage.finalizeRecord(lecture.id, lecture.audioMs);
			await lecture.update({ status: SessionStatus.PROCESSING });
		});

		queueMicrotask(async () => {
			try {
				await ai.transcribe(lecture.id);
				await ai.classify(lecture.id);
				await ai.writeFiche(lecture.id);

				await lecture.update({ status: SessionStatus.COMPLETED });
			} catch (error) {
				console.error(error);
				await lecture.update({ status: SessionStatus.FAILED });
			}
		});

		return res.json({ success: true });
	});
