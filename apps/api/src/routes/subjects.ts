import { type CatalogModel, catalogRouter } from "@/routes/catalog.ts";
import { Lecture } from "@/models/lecture.ts";
import { Subject } from "@/models/subject.ts";

export default catalogRouter(Subject as CatalogModel, {
	param: "subjectId",
	nameMax: 120,
	async counts() {
		const lectures = await Lecture.findAll({ attributes: ["subjectId"] });
		const counts = new Map<string, number>();
		for (const lecture of lectures) {
			if (!lecture.subjectId) continue;
			counts.set(lecture.subjectId, (counts.get(lecture.subjectId) || 0) + 1);
		}
		return counts;
	},
});
