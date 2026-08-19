import { Router, z } from "@webtools/expressapi";

import { chatFileKind } from "@magi/shared/types/chat-file";
import { type ChatAttachment, ChatMessage, ChatRole } from "@/models/chat-message.ts";
import type { Lecture } from "@/models/lecture.ts";
import { replyStream } from "@/services/ai/index.ts";
import { readChatDocument } from "@/services/ai/documents.ts";
import * as storage from "@/services/storage.ts";
import { sendFile } from "@/utils/files.ts";
import { sendNdjson } from "@/utils/ndjson.ts";
import { config } from "@/config.ts";

const chatFile = z.file().maxSize(config.maxChatFileBytes);

function publicMessage(item: ChatMessage) {
	const json = item.toJSON();
	if (!json.attachments) return json;
	return {
		...json,
		attachments: json.attachments.map(({ kind, path, name }) => ({ kind, path, name })),
	};
}

function chatError(error: unknown): { status: number; error: string } {
	const code = error instanceof Error ? error.message : "";
	if (code === "pdf_unreadable") return { status: 400, error: code };
	if (code === "context_exceeded") return { status: 413, error: code };
	return { status: 502, error: "ai_unavailable" };
}

export default new Router<{ lecture: Lecture }>()
	.get("/:lectureId/chat", async (req, res) => {
		const items = await ChatMessage.findAll({
			where: { lectureId: req.data.lecture.id },
			order: [["createdAt", "ASC"]],
		});

		return res.json({
			success: true,
			data: items.map(publicMessage),
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
			const files = [req.body.files || []].flat();

			if (!content && files.length === 0) {
				return res.status(400).json({
					success: false as const,
					error: "empty_message",
				});
			}

			const attachments: ChatAttachment[] = [];
			try {
				for (const file of files) {
					const kind = chatFileKind(file.type, file.name);
					if (!kind) {
						await storage.removeChatFiles(lecture.id, attachments.map((item) => item.path));
						return res.status(400).json({
							success: false as const,
							error: "unsupported_file",
						});
					}

					const path = await storage.saveChatFile(lecture.id, file, kind);
					const attachment: ChatAttachment = { kind, path, name: file.name };
					if (kind !== "image") {
						attachment.text = await readChatDocument(storage.chatFilePath(lecture.id, path), kind);
					}
					attachments.push(attachment);
				}
			} catch (error) {
				await storage.removeChatFiles(lecture.id, attachments.map((item) => item.path));
				const failed = chatError(error);
				return res.status(failed.status).json({
					success: false as const,
					error: failed.error,
				});
			}

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

			return sendNdjson(res, async (send) => {
				send({ type: "user", data: publicMessage(user) });

				let answer = "";
				try {
					for await (
						const piece of replyStream({
							lecture,
							history: [...previous, user].map((item) => ({
								role: item.role,
								content: item.content,
								attachments: item.attachments,
							})),
						})
					) {
						answer += piece;
						send({ type: "delta", text: piece });
					}

					if (!answer.trim()) throw new Error("empty_reply");

					const assistant = await ChatMessage.create({
						lectureId: lecture.id,
						role: ChatRole.ASSISTANT,
						content: answer.trim(),
						attachments: null,
					});

					send({ type: "done", data: publicMessage(assistant) });
				} catch (error) {
					console.error(error);
					await user.destroy();
					await storage.removeChatFiles(lecture.id, attachments.map((item) => item.path));
					send({ type: "error", error: chatError(error).error });
				}
			});
		},
		[],
		{
			body: z.object({
				content: z.optional(z.string().max(4000)),
				files: z.optional(z.union([chatFile, z.array(chatFile).max(config.maxChatFiles)])),
			}),
		},
	)
	.delete("/:lectureId/chat", async (req, res) => {
		await ChatMessage.destroy({ where: { lectureId: req.data.lecture.id } });
		await storage.removeChatDir(req.data.lecture.id);

		return res.json({ success: true as const });
	});
