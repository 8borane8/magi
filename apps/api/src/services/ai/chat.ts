import { config } from "@/config.ts";
import type { ChatAttachment, ChatRole } from "@/models/chat-message.ts";
import type { Lecture } from "@/models/lecture.ts";
import * as storage from "@/services/storage.ts";

import { subjectCourseList } from "./catalog.ts";
import { chatStream, type OllamaMessage } from "./client.ts";
import { readChatDocument } from "./documents.ts";
import { PROMPT_CHAT } from "./prompts.ts";

type ChatReplyInput = {
	lecture: Lecture;
	history: Array<{ role: ChatRole; content: string; attachments?: ChatAttachment[] | null }>;
	think?: boolean;
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

async function withDocuments(
	lectureId: string,
	content: string,
	attachments?: ChatAttachment[] | null,
): Promise<string> {
	const docs = (attachments || []).filter(
		(item): item is ChatAttachment & { kind: "pdf" | "text" } => item.kind === "pdf" || item.kind === "text",
	);
	if (docs.length === 0) return content;

	const blocks = await Promise.all(docs.map(async (doc) => {
		const text = await readChatDocument(storage.chatFilePath(lectureId, doc.path), doc.kind);
		return `## Document : ${doc.name || doc.path}\n${text || "(fichier vide)"}`;
	}));

	return [content, ...blocks].filter(Boolean).join("\n\n");
}

async function buildMessages(input: ChatReplyInput): Promise<{
	messages: OllamaMessage[];
	model: string;
}> {
	const lectureId = input.lecture.id;
	const [fiche, courses] = await Promise.all([
		readFiche(lectureId),
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
		...await Promise.all(input.history.map(async (item) => ({
			role: item.role,
			content: item.role === "user"
				? await withDocuments(lectureId, item.content, item.attachments)
				: item.content,
		}))),
	];

	const images = (input.history.at(-1)?.attachments || []).filter((item) => item.kind === "image");
	if (images.length > 0) {
		const user = messages.at(-1);
		if (user && user.role === "user") {
			user.images = await Promise.all(
				images.map(async (item) =>
					encodeBase64(await Deno.readFile(storage.chatFilePath(lectureId, item.path)))
				),
			);
		}
	}

	return {
		messages,
		model: images.length > 0 ? config.ollamaVisionModel : config.ollamaChatModel,
	};
}

export async function* replyStream(input: ChatReplyInput): AsyncGenerator<string> {
	const { messages, model } = await buildMessages(input);
	yield* chatStream(messages, { model, temperature: 0.5, think: input.think });
}
