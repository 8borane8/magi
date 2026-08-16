import type { Middleware } from "@webtools/expressapi";

import { Lecture } from "@/models/lecture.ts";

export const loadLecture: Middleware<{ lecture: Lecture }> = async (req, res) => {
	const lecture = await Lecture.findByPk(req.params.lectureId);
	if (!lecture) {
		return res.status(404).json({
			success: false as const,
			error: "404 Not Found.",
		});
	}

	req.data.lecture = lecture;
};
