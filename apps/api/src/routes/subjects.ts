import { Router, z } from "@webtools/expressapi";

import { Lecture } from "@/models/lecture.ts";
import { Subject } from "@/models/subject.ts";

export default new Router()
	.get("/", async (_req, res) => {
		const [subjects, lectures] = await Promise.all([
			Subject.findAll({ order: [["name", "ASC"]] }),
			Lecture.findAll({ attributes: ["subjectId"] }),
		]);
		const counts = new Map<string, number>();
		for (const lecture of lectures) {
			if (!lecture.subjectId) continue;
			counts.set(lecture.subjectId, (counts.get(lecture.subjectId) ?? 0) + 1);
		}

		return res.json({
			items: subjects.map((subject) => ({
				...subject.toJSON(),
				lectureCount: counts.get(subject.id) ?? 0,
			})),
		});
	})
	.put(
		"/",
		async (req, res) => {
			await Subject.upsert(req.body);
			return res.json({ success: true });
		},
		[],
		{
			body: z.object({
				id: z.optional(z.string().uuid()),
				name: z.string().min(1).max(120),
				color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
			}),
		},
	)
	.delete("/:subjectId", async (req, res) => {
		const deletedRowsCount = await Subject.destroy({ where: { id: req.params.subjectId } });
		if (deletedRowsCount === 0) {
			return res.status(404).json({
				success: false,
				error: "404 Not Found.",
			});
		}

		return res.json({ success: true });
	});
