import type { Page } from "@webtools/slick-server";

import Home from "../islands/app/home.tsx";

export default {
	url: "/",
	template: "app",

	title: "Accueil | Magi",

	styles: [
		"/styles/app/home.css",
	],
	scripts: [],

	head: null,
	body: <Home />,

	onpost: null,
	onrequest: null,
} satisfies Page;
