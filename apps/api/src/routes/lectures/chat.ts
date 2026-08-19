import { Router, z } from "@webtools/expressapi";

import { chatFileKind } from "@magi/shared/types/chat-file";
import { type ChatAttachment, ChatMessage, ChatRole } from "@/models/chat-message.ts";
import type { Lecture } from "@/models/lecture.ts";
import { replyStream } from "@/services/ai/index.ts";
import * as chatLive from "@/services/chat-events.ts";
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

async function saveReply(lecture: Lecture, answer: string, signal: AbortSignal): Promise<void> {
	const content = answer.trim();
	if (content) {
		const assistant = await ChatMessage.create({
			lectureId: lecture.id,
			role: ChatRole.ASSISTANT,
			content,
			attachments: null,
		});
		chatLive.endChat(lecture.id, { type: "done", data: publicMessage(assistant) });
		return;
	}
	if (signal.aborted) {
		chatLive.endChat(lecture.id, { type: "done" });
		return;
	}
	throw new Error("empty_reply");
}

async function generateReply(
	lecture: Lecture,
	user: ChatMessage,
	previous: ChatMessage[],
	attachments: ChatAttachment[],
	think: boolean,
	signal: AbortSignal,
): Promise<void> {
	let answer = "";
	try {
		for await (
			const piece of replyStream({
				lecture,
				think,
				signal,
				history: [...previous, user].map((item) => ({
					role: item.role,
					content: item.content,
					attachments: item.attachments,
				})),
			})
		) {
			answer += piece;
			chatLive.appendDelta(lecture.id, piece);
		}
		await saveReply(lecture, answer, signal);
	} catch (error) {
		if (signal.aborted) {
			await saveReply(lecture, answer, signal);
			return;
		}
		console.error(error);
		await user.destroy();
		await storage.removeChatFiles(lecture.id, attachments.map((item) => item.path));
		chatLive.endChat(lecture.id, { type: "error", error: chatError(error).error });
	}
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
	.get("/:lectureId/chat/live", (req, res) => {
		const lectureId = req.data.lecture.id;
		return sendNdjson(res, (send, signal) => chatLive.followChat(lectureId, send, signal));
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
			const think = req.body.think === true || req.body.think === "true";

			if (!content && files.length === 0) {
				return res.status(400).json({
					success: false as const,
					error: "empty_message",
				});
			}

			if (chatLive.isBusy(lecture.id)) {
				return res.status(409).json({
					success: false as const,
					error: "busy",
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
					attachments.push({ kind, path, name: file.name });
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

			const signal = chatLive.startChat(lecture.id);
			if (!signal) {
				await user.destroy();
				await storage.removeChatFiles(lecture.id, attachments.map((item) => item.path));
				return res.status(409).json({
					success: false as const,
					error: "busy",
				});
			}

			void generateReply(lecture, user, previous, attachments, think, signal);

			return res.json({
				success: true as const,
				data: publicMessage(user),
			});
		},
		[],
		{
			body: z.object({
				content: z.optional(z.string().max(4000)),
				files: z.optional(z.union([chatFile, z.array(chatFile).max(config.maxChatFiles)])),
				think: z.optional(z.union([z.boolean(), z.enum(["true", "false"])])),
			}),
		},
	)
	.post("/:lectureId/chat/stop", (req, res) => {
		chatLive.abortChat(req.data.lecture.id);
		return res.json({ success: true as const });
	})
	.delete("/:lectureId/chat", async (req, res) => {
		if (chatLive.isBusy(req.data.lecture.id)) {
			return res.status(409).json({
				success: false as const,
				error: "busy",
			});
		}

		await ChatMessage.destroy({ where: { lectureId: req.data.lecture.id } });
		await storage.removeChatDir(req.data.lecture.id);

		return res.json({ success: true as const });
	});
