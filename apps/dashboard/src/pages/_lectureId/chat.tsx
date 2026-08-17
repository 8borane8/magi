import { SessionStatus } from "@magi/shared/types/session";
import type { Page } from "@webtools/slick-server";

import { lectureTitle } from "../../utils/lecture-format.ts";
import LectureChat from "../../islands/app/_lectureId/chat.tsx";
import { createClient } from "../../client.ts";

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
		const nodeUrl = req.cookies.nodeUrl;

		return (
			<LectureChat
				lectureId={lecture.id}
				nodeUrl={nodeUrl}
				title={lectureTitle(lecture)}
				fullPage
			/>
		);
	},

	onpost: null,
	onrequest: async (req, res) => {
		const lectureId = req.params.lectureId!;
		const lectureRes = await createClient(req.cookies.nodeUrl).get("/lectures/:lectureId", {
			params: { lectureId },
		});

		if (!lectureRes.success || lectureRes.data.status !== SessionStatus.COMPLETED) return res.redirect("/");

		req.data.lecture = lectureRes.data;
	},
} satisfies Page;
