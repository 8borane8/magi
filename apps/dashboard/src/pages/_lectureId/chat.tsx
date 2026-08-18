import { SessionStatus } from "@magi/shared/types/session";
import type { Page } from "@webtools/slick-server";

import { lectureTitle } from "../../utils/lecture-format.ts";
import LectureChat from "../../islands/app/_lectureId/chat.tsx";
import { createClient, nodeUrl } from "../../client.ts";

export default {
	url: "/l/:lectureId/chat",
	template: "app",

	title: (req) => `Prof | ${lectureTitle(req.data.lecture)} | Magi`,

	styles: [
		"/styles/app/_lectureId/fiche.css",
		"/styles/app/_lectureId/chat.css",
		"/styles/app/_lectureId/dialog.css",
	],
	scripts: [],

	head: null,
	body: (req) => {
		const lecture = req.data.lecture;
		const url = nodeUrl(req.cookies.nodeUrl)!;

		return (
			<LectureChat
				lectureId={lecture.id}
				nodeUrl={url}
				title={lectureTitle(lecture)}
				messages={req.data.chat}
				fullPage
			/>
		);
	},

	onpost: null,
	onrequest: async (req, res) => {
		const lectureId = req.params.lectureId!;
		const client = createClient(req.cookies.nodeUrl);
		const [lectureRes, chatRes] = await Promise.all([
			client.get("/lectures/:lectureId", { params: { lectureId } }),
			client.get("/lectures/:lectureId/chat", { params: { lectureId } }),
		]);

		if (!lectureRes.success || lectureRes.data.status !== SessionStatus.COMPLETED) return res.redirect("/");

		req.data.lecture = lectureRes.data;
		req.data.chat = chatRes.success ? chatRes.data : [];
	},
} satisfies Page;
