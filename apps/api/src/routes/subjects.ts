import { Op } from "@sequelize/core";
import { Router, z } from "@webtools/expressapi";

import { Lecture } from "@/models/lecture.ts";
import { Subject } from "@/models/subject.ts";

export default new Router()
	.get("/", async (_req, res) => {
		const subjects = await Subject.findAll({ order: [["name", "ASC"]] });
		const lectureCount = await Lecture.count({
			where: { subjectId: { [Op.in]: subjects.map((subject) => subject.id) } },
		});

		return res.json({
			items: subjects.map((subject) => ({
				...subject.toJSON(),
				lectureCount,
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
				archived: z.boolean(),
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
