import { SessionStatus } from "@magi/shared/types/session";
import type { Page } from "@webtools/slick-server";

import { formatBytes, formatDate, formatDuration, lectureTitle, STATUS_LABEL } from "../../utils/lecture-format.ts";
import LectureAudio from "../../islands/app/_lectureId/audio.tsx";
import LectureChat from "../../islands/app/_lectureId/chat.tsx";
import LectureNav from "../../islands/app/_lectureId/nav-actions.tsx";
import LectureResume from "../../islands/app/_lectureId/resume.tsx";
import { createClient } from "../../client.ts";

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
		const nodeUrl = req.cookies.nodeUrl;

		return (
			<section id="lecture">
				<LectureNav
					lectureId={lecture.id}
					title={lecture.title ?? ""}
					createdAt={lecture.createdAt}
					notes={lecture.notes ?? ""}
					subjectId={lecture.subjectId ?? ""}
					tagIds={JSON.stringify((lecture.tags ?? []).map((tag: { id: string }) => tag.id))}
				/>

				<aside id="lecture-meta">
					<dl>
						<div>
							<dt>Statut</dt>
							<dd>
								<span class="pill" data-status={lecture.status}>
									{STATUS_LABEL[lecture.status as SessionStatus] ?? lecture.status}
								</span>
							</dd>
						</div>
						<div>
							<dt>Date</dt>
							<dd>{formatDate(lecture.createdAt)}</dd>
						</div>
						<div>
							<dt>Durée</dt>
							<dd>{formatDuration(lecture.audioMs)}</dd>
						</div>
						<div>
							<dt>Audio</dt>
							<dd>{formatBytes(lecture.audioBytes)}</dd>
						</div>
						{lecture.subject && (
							<div>
								<dt>Matière</dt>
								<dd>
									<span class="pill">
										<span class="swatch" style={{ background: lecture.subject.color }}></span>
										{lecture.subject.name}
									</span>
								</dd>
							</div>
						)}
					</dl>

					{(lecture.tags?.length ?? 0) > 0 && (
						<>
							<h2>Étiquettes</h2>
							<ul>
								{(lecture.tags || []).map((tag: { id: string; name: string; color: string }) => (
									<li key={tag.id}>
										<span class="swatch" style={{ background: tag.color }}></span>
										{tag.name}
									</li>
								))}
							</ul>
						</>
					)}
				</aside>

				<article>
					<h1>{lectureTitle(lecture)}</h1>
					{lecture.notes && <p class="lecture-notes">{lecture.notes}</p>}
					<LectureResume source={req.data.resume} failed={req.data.resumeFailed} />
				</article>

				<LectureChat lectureId={lecture.id} nodeUrl={nodeUrl} />

				<LectureAudio
					src={`${nodeUrl}/lectures/${lecture.id}/data/record`}
					audioMs={lecture.audioMs}
				/>
			</section>
		);
	},

	onpost: null,
	onrequest: async (req, res) => {
		const nodeUrl = req.cookies.nodeUrl;
		const lectureId = req.params.lectureId!;
		const client = createClient(nodeUrl);

		const [lectureRes, resumeRes] = await Promise.all([
			client.get("/lectures/:lectureId", { params: { lectureId } }),
			fetch(`${String(nodeUrl).replace(/\/+$/, "")}/lectures/${encodeURIComponent(lectureId)}/data/resume`)
				.catch(() => null),
		]);

		if (!lectureRes.success || lectureRes.data.status !== SessionStatus.COMPLETED) return res.redirect("/");

		req.data.lecture = lectureRes.data;

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
