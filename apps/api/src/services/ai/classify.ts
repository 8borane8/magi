import { Lecture } from "@/models/lecture.ts";
import { LectureTag } from "@/models/lecture-tag.ts";
import { Subject } from "@/models/subject.ts";
import { Tag } from "@/models/tag.ts";
import * as storage from "@/services/storage.ts";

import { chat } from "./client.ts";
import { PROMPT_CLASSIFY } from "./prompts.ts";

const PALETTE = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#d97706", "#059669", "#0891b2"];

type ClassifyPayload = {
	title?: unknown;
	subject?: unknown;
	tags?: unknown;
};

function colorFor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return PALETTE[hash % PALETTE.length];
}

function asName(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function catalogBlock(label: string, names: string[]): string {
	if (names.length === 0) return `${label} : aucune, tu peux en créer.`;
	return `${label} :\n${names.map((name) => `- ${name}`).join("\n")}`;
}

function normalizeName(name: string): string {
	return name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/gi, " ")
		.trim();
}

async function findOrCreate<T extends { id: string; name: string }>(
	name: string,
	known: T[],
	create: (name: string, color: string) => Promise<T>,
): Promise<T> {
	const key = normalizeName(name);
	const match = known.find((item) => normalizeName(item.name) === key);
	if (match) return match;
	const created = await create(name, colorFor(name));
	known.push(created);
	return created;
}

export async function classify(lectureId: string): Promise<void> {
	const lecture = await Lecture.findByPk(lectureId);
	if (!lecture) throw new Error("lecture_not_found");

	const transcript = await Deno.readTextFile(storage.transcriptPath(lectureId));
	const [subjects, tags] = await Promise.all([
		Subject.findAll({ order: [["name", "ASC"]] }),
		Tag.findAll({ order: [["name", "ASC"]] }),
	]);

	const raw = await chat(
		[
			{ role: "system", content: PROMPT_CLASSIFY },
			{
				role: "user",
				content: [
					catalogBlock("Matières existantes", subjects.map((item) => item.name)),
					catalogBlock("Étiquettes existantes", tags.map((item) => item.name)),
					"Transcription :",
					transcript,
				].join("\n\n"),
			},
		],
		{ format: "json", temperature: 0.2, numPredict: 256 },
	);

	const payload = JSON.parse(raw) as ClassifyPayload;
	const title = asName(payload.title).slice(0, 80);
	if (!title) throw new Error("classify_missing_title");

	const subjectName = asName(payload.subject);
	const subjectKey = normalizeName(subjectName);
	const seen = new Set<string>();
	const tagNames: string[] = [];
	for (const item of Array.isArray(payload.tags) ? payload.tags : []) {
		const name = asName(item);
		const key = normalizeName(name);
		if (!key || key === subjectKey || seen.has(key)) continue;
		seen.add(key);
		tagNames.push(name);
		if (tagNames.length >= 6) break;
	}

	const subject = subjectName
		? await findOrCreate(subjectName, subjects, (name, color) => Subject.create({ name, color }))
		: null;

	await lecture.update({
		title,
		subjectId: subject?.id ?? lecture.subjectId,
	}, { silent: true });

	if (tagNames.length === 0) return;

	const resolved = await Promise.all(
		tagNames.map((name) => findOrCreate(name, tags, (item, color) => Tag.create({ name: item, color }))),
	);
	await LectureTag.destroy({ where: { lectureId } });
	await LectureTag.bulkCreate(resolved.map((tag) => ({ lectureId, tagId: tag.id })));
}
