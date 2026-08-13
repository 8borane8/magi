import type { Page } from "@webtools/slick-server";

import SetNode from "../islands/auth/set-node.tsx";

export default {
	url: "/set-node",
	template: "auth",

	title: "Connecter le noeud | Magi",

	styles: [
		"/styles/app/set-node.css",
	],
	scripts: [],

	head: null,
	body: (
		<section id="set-node">
			<SetNode />
		</section>
	),

	onpost: null,
	onrequest: null,
} satisfies Page;
