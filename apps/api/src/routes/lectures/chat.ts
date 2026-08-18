import { Router, z } from "@webtools/expressapi";

import { ChatMessage, ChatRole } from "@/models/chat-message.ts";
import type { Lecture } from "@/models/lecture.ts";
import { reply } from "@/services/ai/index.ts";
import * as storage from "@/services/storage.ts";
import { sendFile } from "@/utils/files.ts";
import { config } from "@/config.ts";

const chatImage = z.file()
	.type(["image/jpeg", "image/png", "image/webp", "image/gif"])
	.maxSize(config.maxChatImageBytes);

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
	.get("/:lectureId/chat/:fileName", (req, res) => {
		const { fileName } = req.params;
		if (!storage.isSafeChatFileName(fileName)) {
			return res.status(404).json({
				success: false as const,
				error: "404 Not Found.",
			});
		}
		return sendFile(req, res, storage.chatFilePath(req.data.lecture.id, fileName));
	})
	.post(
		"/:lectureId/chat",
		async (req, res) => {
			const lecture = req.data.lecture;
			const content = (req.body.content || "").trim();
			const images = [req.body.images || []].flat();

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

			const previous = await ChatMessage.findAll({
				where: { lectureId: lecture.id },
				order: [["createdAt", "ASC"]],
			});

			const user = await ChatMessage.create({
				lectureId: lecture.id,
				role: ChatRole.USER,
				content,
				attachments: attachments.length ? attachments : null,
			});

			const history = [
				...previous.map((item) => ({ role: item.role, content: item.content })),
				{ role: user.role, content: user.content },
			];

			let answer: string;
			try {
				answer = await reply({
					lecture,
					history,
					userText: content,
					imagePaths: attachments.map((item) => storage.chatFilePath(lecture.id, item.path)),
				});
			} catch (error) {
				console.error(error);
				await user.destroy();
				for (const item of attachments) {
					try {
						await Deno.remove(storage.chatFilePath(lecture.id, item.path));
					} catch {
						// Already gone.
					}
				}
				return res.status(502).json({
					success: false as const,
					error: "ai_unavailable",
				});
			}

			const assistant = await ChatMessage.create({
				lectureId: lecture.id,
				role: ChatRole.ASSISTANT,
				content: answer,
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
