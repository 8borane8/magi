import { Router, z } from "@webtools/expressapi";

import { SessionStatus } from "@magi/shared/types/session";
import * as recording from "@/services/recording.ts";
import * as storage from "@/services/storage.ts";
import { Lecture } from "@/models/lecture.ts";
import { config } from "@/config.ts";
import * as ai from "@/services/ai/index.ts";

function isLive(status: SessionStatus): boolean {
	return [SessionStatus.RECORDING, SessionStatus.PAUSED].includes(status);
}

async function processLecture(lectureId: string): Promise<void> {
	const lecture = await Lecture.findByPk(lectureId);
	if (!lecture) return;

	try {
		await ai.transcribe(lectureId);
		await ai.classify(lectureId);
		await ai.writeFiche(lectureId);
		await lecture.update({ status: SessionStatus.COMPLETED });
	} catch (error) {
		console.error(error);
		await lecture.update({ status: SessionStatus.FAILED });
	}
}

async function setPaused(lecture: Lecture, paused: boolean): Promise<boolean> {
	let ok = false;

	await recording.withLectureLock(lecture.id, async () => {
		await lecture.reload();
		if (!isLive(lecture.status)) return;
		if (paused) storage.closeLectureFiles(lecture.id);

		await lecture.update({
			status: paused ? SessionStatus.PAUSED : SessionStatus.RECORDING,
		});

		if (paused) recording.clearStalePause(lecture.id);
		else recording.armStalePause(lecture.id);
		ok = true;
	});

	return ok;
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
						return res.json({ success: true });

					case "duplicate":
						return res.status(409).json({
							success: false,
							error: "sequence_duplicate",
						});

					case "gap":
						return res.status(409).json({
							success: false,
							error: "sequence_gap",
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
		const ok = await setPaused(req.data.lecture, true);
		if (!ok) {
			return res.status(409).json({
				success: false,
				error: "lecture_not_live",
			});
		}
		return res.json({ success: true });
	})
	.post("/:lectureId/resume", async (req, res) => {
		const ok = await setPaused(req.data.lecture, false);
		if (!ok) {
			return res.status(409).json({
				success: false,
				error: "lecture_not_live",
			});
		}
		return res.json({ success: true });
	})
	.post("/:lectureId/stop", async (req, res) => {
		const lecture = req.data.lecture;
		let empty = false;
		let notLive = false;

		await recording.withLectureLock(lecture.id, async () => {
			await lecture.reload();
			if (!isLive(lecture.status)) {
				notLive = true;
				return;
			}
			if (!lecture.audioBytes) {
				empty = true;
				return;
			}

			recording.clearStalePause(lecture.id);
			await storage.finalizeRecord(lecture.id, lecture.audioMs);
			await lecture.update({ status: SessionStatus.PROCESSING });
		});

		if (notLive) {
			return res.status(409).json({
				success: false,
				error: "lecture_not_live",
			});
		}
		if (empty) {
			return res.status(400).json({
				success: false,
				error: "empty_recording",
			});
		}

		recording.runProcess(lecture.id, () => processLecture(lecture.id));
		return res.json({ success: true });
	})
	.post("/:lectureId/retry", async (req, res) => {
		const lecture = req.data.lecture;
		let accepted = false;

		await recording.withLectureLock(lecture.id, async () => {
			await lecture.reload();
			if (lecture.status !== SessionStatus.FAILED) return;
			await lecture.update({ status: SessionStatus.PROCESSING });
			accepted = true;
		});

		if (!accepted) {
			return res.status(409).json({
				success: false,
				error: "lecture_not_failed",
			});
		}

		recording.runProcess(lecture.id, () => processLecture(lecture.id));
		return res.json({ success: true });
	});
