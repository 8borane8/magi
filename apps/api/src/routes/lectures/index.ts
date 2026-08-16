import { Op, type WhereOptions } from "@sequelize/core";
import { Router, z } from "@webtools/expressapi";

import { SessionStatus } from "@magi/shared/types/session";
import { LectureTag } from "@/models/lecture-tag.ts";
import { loadLecture } from "@/middlewares/lecture.ts";
import * as recording from "@/services/recording.ts";
import * as storage from "@/services/storage.ts";
import { Lecture } from "@/models/lecture.ts";

import recordingRouter from "@/routes/lectures/recording.ts";
import chatRouter from "@/routes/lectures/chat.ts";

const withRelations = [{ association: "subject" }, { association: "tags" }];

export default new Router()
	.get(
		"/",
		async (req, res) => {
			const { q, status, subjectId, tagId, from, to } = req.query;
			const limit = req.query.limit || 50;
			const page = req.query.page || 1;
			const offset = (page - 1) * limit;

			const where: WhereOptions<Lecture> = {};

			if (status) where.status = status;
			if (subjectId) where.subjectId = subjectId;

			if (q) {
				const pattern = `%${q}%`;
				Object.assign(where, {
					[Op.or]: [
						{ title: { [Op.like]: pattern } },
						{ notes: { [Op.like]: pattern } },
					],
				});
			}

			if (from || to) {
				where.createdAt = {
					...(from ? { [Op.gte]: new Date(from) } : {}),
					...(to ? { [Op.lte]: new Date(to) } : {}),
				};
			}

			if (tagId) {
				const links = await LectureTag.findAll({ where: { tagId }, attributes: ["lectureId"] });
				where.id = { [Op.in]: links.map((link) => link.lectureId) };
			}

			const { rows, count } = await Lecture.findAndCountAll({
				where,
				include: withRelations,
				order: [["createdAt", "DESC"]],
				distinct: true,
				limit,
				offset,
			});

			return res.json({
				success: true as const,
				data: {
					rows: rows.map((lecture) => lecture.toJSON()),
					total: count,
					limit,
					page,
				},
			});
		},
		[],
		{
			query: z.object({
				q: z.optional(z.string()),
				status: z.optional(z.enum(Object.values(SessionStatus))),
				subjectId: z.optional(z.string().uuid()),
				tagId: z.optional(z.string().uuid()),
				from: z.optional(z.string()),
				to: z.optional(z.string()),
				limit: z.optional(z.number().int().min(1).max(200)),
				page: z.optional(z.number().int().min(1)),
			}),
		},
	)
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
	.use(loadLecture)
	.get("/:lectureId", async (req, res) => {
		await req.data.lecture.reload({ include: withRelations });

		return res.json({
			success: true as const,
			data: req.data.lecture.toJSON(),
		});
	})
	.patch(
		"/:lectureId",
		async (req, res) => {
			const lecture = req.data.lecture;
			const { title, notes, subjectId, tagIds } = req.body;
			await lecture.update({ title, notes, subjectId });

			if (tagIds !== undefined) {
				await LectureTag.destroy({ where: { lectureId: lecture.id } });
				if (tagIds.length > 0) {
					await LectureTag.bulkCreate(tagIds.map((tagId) => ({ lectureId: lecture.id, tagId })));
				}
			}

			return res.json({ success: true });
		},
		[],
		{
			body: z.object({
				id: z.string().uuid(),
				title: z.nullable(z.string().max(300)),
				notes: z.nullable(z.string()),
				subjectId: z.nullable(z.string().uuid()),
				tagIds: z.optional(z.array(z.string().uuid())),
			}),
		},
	)
	.use(chatRouter)
	.use(recordingRouter);
