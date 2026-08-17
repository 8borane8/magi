import { Op } from "@sequelize/core";

import { SessionStatus } from "@magi/shared/types/session";
import { Lecture } from "@/models/lecture.ts";

export async function subjectCourseList(lecture: Lecture): Promise<string> {
	if (!lecture.subjectId) {
		return "Aucun autre cours lié : ce cours n'a pas encore de matière.";
	}

	const others = await Lecture.findAll({
		where: {
			subjectId: lecture.subjectId,
			status: SessionStatus.COMPLETED,
			id: { [Op.ne]: lecture.id },
		},
		attributes: ["id", "title"],
		order: [["createdAt", "ASC"]],
	});

	if (others.length === 0) {
		return "Aucun autre cours dans cette matière pour l'instant.";
	}

	return [
		"Cours déjà dans cette matière. Pour un lien réel uniquement : [Titre](/l/{id})",
		...others.map((item) => `- [${item.title?.trim() || "Cours sans titre"}](/l/${item.id})`),
	].join("\n");
}
