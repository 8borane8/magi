import type { Page } from "@webtools/slick-server";

import Subjects from "../islands/app/subjects.tsx";

export default {
	url: "/subjects",
	template: "app",

	title: "Matières | Magi",

	styles: [
		"/styles/app/catalog.css",
	],
	scripts: [],

	head: null,
	body: <Subjects />,

	onpost: null,
	onrequest: null,
} satisfies Page;
