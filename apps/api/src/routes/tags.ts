import { type CatalogModel, catalogRouter } from "@/routes/catalog.ts";
import { LectureTag } from "@/models/lecture-tag.ts";
import { Tag } from "@/models/tag.ts";

export default catalogRouter(Tag as CatalogModel, {
	param: "tagId",
	nameMax: 80,
	async counts() {
		const links = await LectureTag.findAll({ attributes: ["tagId"] });
		const counts = new Map<string, number>();
		for (const link of links) {
			counts.set(link.tagId, (counts.get(link.tagId) || 0) + 1);
		}
		return counts;
	},
});
