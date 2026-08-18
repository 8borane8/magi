import type { Page } from "@webtools/slick-server";

import SetNode from "../islands/set-node.tsx";

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
	onrequest: (_req, res) => {
		if (Deno.env.get("MAGI_NODE_URL")) return res.redirect("/");
	},
} satisfies Page;
