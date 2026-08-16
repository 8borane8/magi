import { type HttpResponse, Router, z } from "@webtools/expressapi";

import { ChatMessage, ChatRole } from "@/models/chat-message.ts";
import type { Lecture } from "@/models/lecture.ts";
import * as storage from "@/services/storage.ts";
import { config } from "@/config.ts";

const chatImage = z.file()
	.type(["image/jpeg", "image/png", "image/webp", "image/gif"])
	.maxSize(config.maxChatImageBytes);

function notFound(res: HttpResponse) {
	return res.status(404).json({
		success: false as const,
		error: "404 Not Found.",
	});
}

async function reply(hasImages: boolean): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 400));
	return [
		hasImages ? "J'ai bien reçu tes images." : "J'ai bien lu ta question.",
		"Le prof local n'est pas encore branché.",
		"Quand Ollama le sera, je m'appuierai sur la fiche de ce cours pour te répondre.",
	].join(" ");
}

export default new Router<{ lecture: Lecture }>()
	.get("/:lectureId/chat", async (req, res) => {
		const items = await ChatMessage.findAll({
			where: { lectureId: req.data.lecture.id },
			order: [["createdAt", "ASC"]],
		});

		return res.json({
			success: true,
			data: items.map((item) => item.toJSON()),
		});
	})
	.get("/:lectureId/chat/:fileName", async (req, res) => {
		const { fileName } = req.params;
		if (!storage.isSafeChatFileName(fileName)) return notFound(res);

		try {
			return await res.sendFile(storage.chatFilePath(req.data.lecture.id, fileName));
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) return notFound(res);
			throw error;
		}
	})
	.post(
		"/:lectureId/chat",
		async (req, res) => {
			const lecture = req.data.lecture;
			const content = (req.body.content ?? "").trim();
			const images = [req.body.images ?? []].flat();

			if (!content && images.length === 0) {
				return res.status(400).json({
					success: false as const,
					error: "empty_message",
				});
			}

			const attachments = await Promise.all(images.map(async (file) => ({
				kind: "image" as const,
				path: await storage.saveChatImage(lecture.id, file),
			})));

			const user = await ChatMessage.create({
				lectureId: lecture.id,
				role: ChatRole.USER,
				content,
				attachments: attachments.length ? attachments : null,
			});

			const assistant = await ChatMessage.create({
				lectureId: lecture.id,
				role: ChatRole.ASSISTANT,
				content: await reply(attachments.length > 0),
				attachments: null,
			});

			return res.json({
				success: true as const,
				data: [user.toJSON(), assistant.toJSON()],
			});
		},
		[],
		{
			body: z.object({
				content: z.optional(z.string().max(4000)),
				images: z.optional(z.union([chatImage, z.array(chatImage).max(config.maxChatImages)])),
			}),
		},
	)
	.delete("/:lectureId/chat", async (req, res) => {
		await ChatMessage.destroy({ where: { lectureId: req.data.lecture.id } });
		await storage.removeChatDir(req.data.lecture.id);

		return res.json({ success: true as const });
	});
