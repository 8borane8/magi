import { config } from "@/config.ts";
import type { ChatRole } from "@/models/chat-message.ts";
import type { Lecture } from "@/models/lecture.ts";
import * as storage from "@/services/storage.ts";

import { subjectCourseList } from "./catalog.ts";
import { chat, type OllamaMessage } from "./client.ts";
import { PROMPT_CHAT } from "./prompts.ts";

export type ChatReplyInput = {
	lecture: Lecture;
	history: Array<{ role: ChatRole; content: string }>;
	userText: string;
	imagePaths: string[];
};

function encodeBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

async function readFiche(lectureId: string): Promise<string> {
	try {
		return await Deno.readTextFile(storage.resumePath(lectureId));
	} catch (error) {
		if (error instanceof Deno.errors.NotFound) return "";
		throw error;
	}
}

export async function reply(input: ChatReplyInput): Promise<string> {
	const [fiche, courses] = await Promise.all([
		readFiche(input.lecture.id),
		subjectCourseList(input.lecture),
	]);
	const messages: OllamaMessage[] = [
		{
			role: "system",
			content: [
				PROMPT_CHAT,
				`## Autres cours\n${courses}`,
				fiche ? `## Fiche du cours\n${fiche}` : "",
			].filter(Boolean).join("\n\n"),
		},
		...input.history.map((item) => ({ role: item.role, content: item.content })),
	];

	const last = messages.at(-1);
	if (!last || last.role !== "user") {
		messages.push({ role: "user", content: input.userText });
	}

	if (input.imagePaths.length > 0) {
		const images = await Promise.all(
			input.imagePaths.map(async (path) => encodeBase64(await Deno.readFile(path))),
		);
		const user = messages.at(-1);
		if (user && user.role === "user") user.images = images;
	}

	const model = input.imagePaths.length > 0 ? config.ollamaVisionModel : config.ollamaChatModel;
	const text = await chat(messages, { model });
	if (!text) throw new Error("empty_reply");
	return text;
}
