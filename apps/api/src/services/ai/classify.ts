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

function parseJson(text: string): ClassifyPayload {
	const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
	return JSON.parse(trimmed) as ClassifyPayload;
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

function matchName<T extends { name: string }>(items: T[], name: string): T | undefined {
	const key = normalizeName(name);
	if (!key) return undefined;
	return items.find((item) => normalizeName(item.name) === key);
}

async function findOrCreateSubject(name: string, known: Subject[]): Promise<Subject> {
	const match = matchName(known, name);
	if (match) return match;
	const created = await Subject.create({ name, color: colorFor(name) });
	known.push(created);
	return created;
}

async function findOrCreateTag(name: string, known: Tag[]): Promise<Tag> {
	const match = matchName(known, name);
	if (match) return match;
	const created = await Tag.create({ name, color: colorFor(name) });
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

	const content = [
		catalogBlock("Matières existantes", subjects.map((item) => item.name)),
		catalogBlock("Étiquettes existantes", tags.map((item) => item.name)),
		"Transcription :",
		transcript,
	].join("\n\n");

	const raw = await chat(
		[
			{ role: "system", content: PROMPT_CLASSIFY },
			{ role: "user", content },
		],
		{ format: "json", temperature: 0.2 },
	);

	const payload = parseJson(raw);
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

	if (subjectName) {
		const subject = await findOrCreateSubject(subjectName, subjects);
		lecture.subjectId = subject.id;
	}

	lecture.title = title;
	await lecture.save();

	if (tagNames.length === 0) return;

	const resolved = await Promise.all(tagNames.map((name) => findOrCreateTag(name, tags)));
	await LectureTag.destroy({ where: { lectureId } });
	await LectureTag.bulkCreate(resolved.map((tag) => ({ lectureId, tagId: tag.id })));
}
