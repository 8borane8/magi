import { Lecture } from "@/models/lecture.ts";
import * as storage from "@/services/storage.ts";

import { subjectCourseList } from "./catalog.ts";
import { chatStream } from "./client.ts";
import { PROMPT_FICHE } from "./prompts.ts";

function unwrapMarkdown(text: string): string {
	return text.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function writeFiche(
	lectureId: string,
	onDelta?: (text: string) => void,
): Promise<void> {
	const lecture = await Lecture.findByPk(lectureId);
	if (!lecture) throw new Error("lecture_not_found");

	const [transcript, courses] = await Promise.all([
		Deno.readTextFile(storage.transcriptPath(lectureId)),
		subjectCourseList(lecture),
	]);

	let raw = "";
	for await (
		const piece of chatStream(
			[
				{ role: "system", content: `${PROMPT_FICHE}\n\n## Autres cours\n${courses}` },
				{ role: "user", content: transcript },
			],
			{ temperature: 0.4 },
		)
	) {
		raw += piece;
		onDelta?.(piece);
	}

	const markdown = unwrapMarkdown(raw);
	if (!markdown) throw new Error("empty_fiche");
	await Deno.writeTextFile(storage.resumePath(lectureId), markdown);
}
