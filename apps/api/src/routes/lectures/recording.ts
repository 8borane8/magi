// ! Review this file

import { Router, z } from "@webtools/expressapi";

import { config } from "@/config.ts";
import { Lecture } from "@/models/lecture.ts";
import * as recording from "@/services/recording.ts";
import * as storage from "@/services/storage.ts";
import { limitedStream, parseRange } from "@/utils/range.ts";

export default new Router()
	.post(
		"/",
		async (req, res) => {
			const lecture = await recording.startLecture(req.body);

			return res.json({
				...lecture.toJSON(),
				upload: recording.uploadState(lecture),
			});
		},
		[],
		{
			body: z.object({
				title: z.optional(z.nullable(z.string().max(300))),
				subjectId: z.optional(z.nullable(z.string().uuid())),
			}),
		},
	)
	.post("/:lectureId/segments", async (req, res) => {
		const result = await recording.openNextSegment(req.params.lectureId);

		if (result.kind === "not-found") return res.status(404).json({ success: false, error: "404 Not Found." });
		if (result.kind === "finished") {
			return res.status(409).json({ error: "lecture_finished", status: result.lecture.status });
		}

		return res.json({ upload: recording.uploadState(result.lecture) });
	})
	.post(
		"/:lectureId/segments/:segment/chunks/:seq",
		async (req, res) => {
			const data = req.body;

			if (!(data instanceof ArrayBuffer)) {
				return res.status(415).json({ error: "binary_body_required" });
			}

			if (data.byteLength === 0) return res.status(400).json({ error: "empty_chunk" });
			if (data.byteLength > config.maxChunkBytes) {
				return res.status(413).json({ error: "chunk_too_large", maxChunkBytes: config.maxChunkBytes });
			}

			try {
				const result = await recording.ingestChunk(
					req.params.lectureId,
					req.params.segment,
					req.params.seq,
					new Uint8Array(data),
				);

				switch (result.kind) {
					case "ok":
					case "duplicate":
						return res.json({
							written: result.kind === "ok",
							upload: recording.uploadState(result.lecture),
						});

					case "gap":
						return res.status(409).json({
							error: "sequence_gap",
							upload: recording.uploadState(result.lecture),
						});

					case "wrong-segment":
						return res.status(409).json({
							error: "wrong_segment",
							upload: recording.uploadState(result.lecture),
						});

					case "finished":
						return res.status(409).json({ error: "lecture_finished", status: result.lecture.status });

					default:
						return res.status(404).json({ success: false, error: "404 Not Found." });
				}
			} catch (error) {
				if (storage.isOutOfSpace(error)) return res.status(507).json({ error: "insufficient_storage" });
				throw error;
			}
		},
		[],
		{
			params: z.object({
				lectureId: z.string(),
				segment: z.number().int().min(0),
				seq: z.number().int().min(0),
			}),
		},
	)
	.post(
		"/:lectureId/pause",
		async (req, res) => {
			const result = await recording.setPaused(req.params.lectureId, true, req.query.durationSec);

			if (result.kind === "not-found") return res.status(404).json({ success: false, error: "404 Not Found." });
			if (result.kind === "finished") {
				return res.status(409).json({ error: "lecture_finished", status: result.lecture.status });
			}

			return res.json({ success: true });
		},
		[],
		{
			query: z.object({ durationSec: z.optional(z.number().int().min(0)) }),
		},
	)
	.post("/:lectureId/resume", async (req, res) => {
		const result = await recording.setPaused(req.params.lectureId, false);

		if (result.kind === "not-found") return res.status(404).json({ success: false, error: "404 Not Found." });
		if (result.kind === "finished") {
			return res.status(409).json({ error: "lecture_finished", status: result.lecture.status });
		}

		return res.json({ success: true });
	})
	.post(
		"/:lectureId/stop",
		async (req, res) => {
			const result = await recording.stopLecture(req.params.lectureId, req.query.durationSec);

			if (result.kind === "not-found") {
				return res.status(404).json({ success: false, error: "404 Not Found." });
			}

			return res.json({ success: true });
		},
		[],
		{
			query: z.object({ durationSec: z.optional(z.number().int().min(0)) }),
		},
	)
	.get(
		"/:lectureId/record",
		async (req, res) => {
			const lecture = await Lecture.findByPk(req.params.lectureId);
			if (!lecture) return res.status(404).json({ success: false, error: "404 Not Found." });

			const segmentIndex = req.query.segment ?? 0;
			const size = await storage.segmentSize(lecture.id, segmentIndex);
			if (size === null) return res.status(404).json({ success: false, error: "404 Not Found." });

			const range = parseRange(req.headers.get("range"), size);

			if (range === "invalid") {
				return res
					.status(416)
					.setHeader("Content-Range", `bytes */${size}`)
					.setHeader("Accept-Ranges", "bytes")
					.send(null);
			}

			const file = await Deno.open(storage.segmentPath(lecture.id, segmentIndex), { read: true });

			if (!range) {
				return res
					.setHeader("Content-Type", "audio/webm")
					.setHeader("Accept-Ranges", "bytes")
					.size(size)
					.send(file.readable);
			}

			const length = range.end - range.start + 1;
			await file.seek(range.start, Deno.SeekMode.Start);

			return res
				.status(206)
				.setHeader("Content-Type", "audio/webm")
				.setHeader("Accept-Ranges", "bytes")
				.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`)
				.size(length)
				.send(limitedStream(file, length));
		},
		[],
		{
			query: z.object({ segment: z.optional(z.number().int().min(0)) }),
		},
	)
	.delete("/:lectureId", async (req, res) => {
		const deletedRowsCount = await Lecture.destroy({ where: { id: req.params.lectureId } });
		if (deletedRowsCount === 0) {
			return res.status(404).json({
				success: false,
				error: "404 Not Found.",
			});
		}

		await recording.deleteLecture(req.params.lectureId);
		return res.json({
			success: true,
		});
	});
