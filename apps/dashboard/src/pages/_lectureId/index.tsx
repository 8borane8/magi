import { SessionStatus } from "@magi/shared/types/session";
import type { Page } from "@webtools/slick-server";

import { lectureTitle } from "../../utils/lecture-format.ts";
import LectureAudio from "../../islands/app/_lectureId/audio.tsx";
import LectureChat from "../../islands/app/_lectureId/chat.tsx";
import LectureHeader from "../../islands/app/_lectureId/lecture-header.tsx";
import { createClient, nodeUrl } from "../../client.ts";

export default {
	url: "/l/:lectureId",
	template: "app",

	title: (req) => `${lectureTitle(req.data.lecture)} | Magi`,

	styles: [
		"/styles/app/_lectureId/layout.css",
		"/styles/app/_lectureId/meta.css",
		"/styles/app/_lectureId/fiche.css",
		"/styles/app/_lectureId/chat.css",
		"/styles/app/_lectureId/audio.css",
		"/styles/app/_lectureId/dialog.css",
	],
	scripts: [],

	head: null,
	body: (req) => {
		const lecture = req.data.lecture;
		const url = nodeUrl(req.cookies.nodeUrl)!;

		return (
			<section id="lecture">
				<LectureHeader
					lectureId={lecture.id}
					title={lecture.title || ""}
					createdAt={String(lecture.createdAt)}
					notes={lecture.notes || ""}
					status={lecture.status}
					audioMs={lecture.audioMs}
					audioBytes={lecture.audioBytes}
					subject={lecture.subject || null}
					tags={lecture.tags || []}
					resume={req.data.resume}
					resumeFailed={req.data.resumeFailed}
				/>

				<LectureChat
					lectureId={lecture.id}
					nodeUrl={url}
					messages={req.data.chat}
				/>

				<LectureAudio
					src={`${url}/lectures/${lecture.id}/data/record`}
					audioMs={lecture.audioMs}
				/>
			</section>
		);
	},

	onpost: null,
	onrequest: async (req, res) => {
		const lectureId = req.params.lectureId!;
		const client = createClient(req.cookies.nodeUrl);

		const [lectureRes, resumeRes, chatRes] = await Promise.all([
			client.get("/lectures/:lectureId", { params: { lectureId } }),
			fetch(`${client.baseUrl}/lectures/${encodeURIComponent(lectureId)}/data/resume`)
				.catch(() => null),
			client.get("/lectures/:lectureId/chat", { params: { lectureId } }),
		]);

		if (!lectureRes.success || lectureRes.data.status !== SessionStatus.COMPLETED) return res.redirect("/");

		req.data.lecture = lectureRes.data;
		req.data.chat = chatRes.success ? chatRes.data : [];

		if (!resumeRes || resumeRes.status === 404) {
			req.data.resume = "";
			req.data.resumeFailed = Boolean(resumeRes === null);
			return;
		}

		if (!resumeRes.ok) {
			req.data.resume = "";
			req.data.resumeFailed = true;
			return;
		}

		req.data.resume = await resumeRes.text();
		req.data.resumeFailed = false;
	},
} satisfies Page;
