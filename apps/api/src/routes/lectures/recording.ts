import { Router, z } from "@webtools/expressapi";

import * as processEvents from "@/services/process-events.ts";
import { type ProcessStage, SessionStatus } from "@magi/shared/types/session";
import * as recording from "@/services/recording.ts";
import * as storage from "@/services/storage.ts";
import { Lecture } from "@/models/lecture.ts";
import * as ai from "@/services/ai/index.ts";
import { config } from "@/config.ts";

function isLive(status: SessionStatus): boolean {
	return [SessionStatus.RECORDING, SessionStatus.PAUSED].includes(status);
}

async function hasTranscript(lectureId: string): Promise<boolean> {
	try {
		const text = await Deno.readTextFile(storage.transcriptPath(lectureId));
		return Boolean(text.trim());
	} catch {
		return false;
	}
}

async function markStage(lecture: Lecture, stage: ProcessStage): Promise<void> {
	if (lecture.processStage !== stage) {
		await lecture.update({ processStage: stage });
	}
	processEvents.setStage(lecture.id, stage);
}

async function processLecture(lectureId: string): Promise<void> {
	const lecture = await Lecture.findByPk(lectureId);
	if (!lecture) {
		processEvents.endProcess(lectureId, "lecture_not_found");
		return;
	}

	try {
		if (!await hasTranscript(lectureId)) {
			await markStage(lecture, "transcribe");
			await ai.transcribe(lectureId);
		}
		await markStage(lecture, "classify");
		await ai.classify(lectureId);
		await markStage(lecture, "fiche");
		await ai.writeFiche(lectureId, (text) => processEvents.appendDelta(lectureId, text));
		await lecture.update({ status: SessionStatus.COMPLETED, processStage: null });
		processEvents.endProcess(lectureId);
	} catch (error) {
		console.error(error);
		await lecture.update({ status: SessionStatus.FAILED, processStage: null });
		processEvents.endProcess(lectureId, error instanceof Error ? error.message : "failed");
	}
}

function startProcessing(lecture: Lecture): void {
	processEvents.startProcess(lecture.id, lecture.processStage || "transcribe");
	recording.runProcess(lecture.id, () => processLecture(lecture.id));
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

			await storage.finalizeRecord(lecture.id, lecture.audioMs);
			await lecture.update({
				status: SessionStatus.PROCESSING,
				processStage: "transcribe",
			});
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

		startProcessing(lecture);
		return res.json({ success: true });
	})
	.post("/:lectureId/retry", async (req, res) => {
		const lecture = req.data.lecture;
		let accepted = false;

		await recording.withLectureLock(lecture.id, async () => {
			await lecture.reload();
			if (lecture.status !== SessionStatus.FAILED) return;
			await lecture.update({
				status: SessionStatus.PROCESSING,
				processStage: "transcribe",
			});
			accepted = true;
		});

		if (!accepted) {
			return res.status(409).json({
				success: false,
				error: "lecture_not_failed",
			});
		}

		startProcessing(lecture);
		return res.json({ success: true });
	});
