import type { Page } from "@webtools/slick-server";

import Tags from "../islands/app/tags.tsx";

export default {
	url: "/tags",
	template: "app",

	title: "Étiquettes | Magi",

	styles: [
		"/styles/app/catalog.css",
	],
	scripts: [],

	head: null,
	body: <Tags />,

	onpost: null,
	onrequest: null,
} satisfies Page;
