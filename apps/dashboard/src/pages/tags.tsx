import type { Page } from "@webtools/slick-server";

import Catalog from "../islands/app/catalog.tsx";

export default {
	url: "/tags",
	template: "app",

	title: "Étiquettes | Magi",

	styles: [
		"/styles/app/catalog.css",
	],
	scripts: [],

	head: null,
	body: <Catalog kind="tags" />,

	onpost: null,
	onrequest: null,
} satisfies Page;
