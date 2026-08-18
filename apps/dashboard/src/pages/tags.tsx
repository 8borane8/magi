import type { Page } from "@webtools/slick-server";

import Catalog from "../islands/app/catalog.tsx";
import { createClient } from "../client.ts";

export default {
	url: "/tags",
	template: "app",

	title: "Étiquettes | Magi",

	styles: [
		"/styles/app/catalog.css",
	],
	scripts: [],

	head: null,
	body: (req) => <Catalog kind="tags" items={req.data.items} loadError={req.data.loadError} />,

	onpost: null,
	onrequest: async (req) => {
		try {
			const res = await createClient(req.cookies.nodeUrl).get("/tags");
			req.data.items = res.success ? res.data : [];
			req.data.loadError = res.success ? null : "Impossible de charger les étiquettes.";
		} catch {
			req.data.items = [];
			req.data.loadError = "Impossible de charger les étiquettes.";
		}
	},
} satisfies Page;
