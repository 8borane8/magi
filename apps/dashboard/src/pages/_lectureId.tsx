import { MessageCircle } from "lucide-preact";
import { SessionStatus } from "@magi/shared/types/session";
import type { Page } from "@webtools/slick-server";

import { formatBytes, formatDate, formatDuration, lectureTitle, STATUS_LABEL } from "../utils/lecture-format.ts";
import MarkdownContent from "../components/markdown-content.tsx";
import LectureDelete from "../islands/app/_lectureId/delete.tsx";
import LectureAudio from "../islands/app/_lectureId/audio.tsx";
import LectureBack from "../islands/app/_lectureId/back.tsx";
import LectureInfoToggle from "../islands/app/_lectureId/info-toggle.tsx";
import LectureChat from "../islands/app/_lectureId/chat.tsx";
import LectureEdit from "../islands/app/_lectureId/edit.tsx";
import { createClient } from "../client.ts";

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
				<nav>
					<LectureBack />
					<div class="lecture-nav-actions">
						<a
							id="lecture-chat-toggle"
							class="btn btn-icon"
							href={`/l/${lecture.id}/chat`}
							aria-label="Prof"
						>
							<MessageCircle size={16} aria-hidden="true" />
						</a>
						<LectureInfoToggle />
						<LectureEdit
							data={JSON.stringify({
								lecture,
								subjects: req.data.subjects,
								tags: req.data.tags,
							})}
						/>
						<LectureDelete lectureId={lecture.id} title={lectureTitle(lecture)} />
					</div>
				</nav>

				<div>
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

					<main>
						<h1>{lectureTitle(lecture)}</h1>
						{lecture.notes && (
							<>
								<div class="lecture-notes">
									<p>{lecture.notes}</p>
								</div>
								<hr />
							</>
						)}
						<article>
							<MarkdownContent source={req.data.resume} />
						</article>
					</main>

					<LectureChat lectureId={lecture.id} nodeUrl={nodeUrl} />
				</div>

				<footer>
					<LectureAudio
						src={`${nodeUrl}/lectures/${lecture.id}/record`}
						audioMs={lecture.audioMs}
					/>
				</footer>
			</section>
		);
	},

	onpost: null,
	onrequest: async (req, res) => {
		const client = createClient(req.cookies.nodeUrl);
		const lectureId = req.params.lectureId!;

		const [lectureRes, subjectsRes, tagsRes] = await Promise.all([
			client.get("/lectures/:lectureId", { params: { lectureId } }),
			client.get("/subjects"),
			client.get("/tags"),
		]);

		if (!lectureRes.success || lectureRes.data.status !== SessionStatus.COMPLETED) return res.redirect("/");

		req.data.lecture = lectureRes.data;
		req.data.subjects = subjectsRes.items;
		req.data.tags = tagsRes.items;
		req.data.resume = await Deno.readTextFile(`${Deno.cwd()}/src/static/examples/resume.md`);
	},
} satisfies Page;
