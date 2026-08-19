import type { Page } from "@webtools/slick-server";

import Home from "../islands/app/home.tsx";
import { createClient } from "../client.ts";
import { readHomeQuery } from "../utils/home-query.ts";

export default {
	url: "/",
	template: "app",

	title: "Accueil | Magi",

	styles: [
		"/styles/app/home/index.css",
	],
	scripts: [],

	head: null,
	body: (req) => (
		<Home
			subjects={req.data.subjects}
			tags={req.data.tags}
			lectures={req.data.lectures}
			error={req.data.error}
		/>
	),

	onpost: null,
	onrequest: async (req) => {
		const queryMark = req.url.indexOf("?");
		const query = readHomeQuery(queryMark === -1 ? "" : req.url.slice(queryMark));
		req.data.subjects = [];
		req.data.tags = [];
		req.data.lectures = [];
		req.data.error = null;

		try {
			const client = createClient(req.cookies.nodeUrl);
			const [subjectsRes, tagsRes, lecturesRes] = await Promise.all([
				client.get("/subjects"),
				client.get("/tags"),
				client.get("/lectures", {
					query: {
						q: query.q || undefined,
						status: query.filters.status || undefined,
						tagId: query.filters.tagId || undefined,
						from: query.filters.from || undefined,
						to: query.filters.to || undefined,
						limit: 200,
						page: 1,
					},
				}),
			]);

			if (!subjectsRes.success || !tagsRes.success || !lecturesRes.success) {
				req.data.error = "Impossible de charger le catalogue.";
				return;
			}

			req.data.subjects = subjectsRes.data;
			req.data.tags = tagsRes.data;
			req.data.lectures = lecturesRes.data;
		} catch {
			req.data.error = "Impossible de charger le catalogue.";
		}
	},
} satisfies Page;
