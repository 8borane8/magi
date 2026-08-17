import type { Page } from "@webtools/slick-server";

import Catalog from "../islands/app/catalog.tsx";

export default {
	url: "/subjects",
	template: "app",

	title: "Matières | Magi",

	styles: [
		"/styles/app/catalog.css",
	],
	scripts: [],

	head: null,
	body: <Catalog kind="subjects" />,

	onpost: null,
	onrequest: null,
} satisfies Page;
