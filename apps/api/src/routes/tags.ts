import { Router, z } from "@webtools/expressapi";

import { Tag } from "@/models/tag.ts";
import { LectureTag } from "@/models/lecture-tag.ts";

export default new Router()
	.get("/", async (_req, res) => {
		const [tags, links] = await Promise.all([
			Tag.findAll({ order: [["name", "ASC"]] }),
			LectureTag.findAll({ attributes: ["tagId"] }),
		]);
		const counts = new Map<string, number>();
		for (const link of links) {
			counts.set(link.tagId, (counts.get(link.tagId) ?? 0) + 1);
		}

		return res.json({
			items: tags.map((tag) => ({
				...tag.toJSON(),
				lectureCount: counts.get(tag.id) ?? 0,
			})),
		});
	})
	.put(
		"/",
		async (req, res) => {
			await Tag.upsert(req.body);
			return res.json({ success: true });
		},
		[],
		{
			body: z.object({
				id: z.optional(z.string().uuid()),
				name: z.string().min(1).max(80),
				color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
			}),
		},
	)
	.delete("/:tagId", async (req, res) => {
		const deletedRowsCount = await Tag.destroy({ where: { id: req.params.tagId } });
		if (deletedRowsCount === 0) {
			return res.status(404).json({
				success: false,
				error: "404 Not Found.",
			});
		}

		return res.json({ success: true });
	});
