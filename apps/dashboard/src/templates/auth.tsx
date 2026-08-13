import type { Template } from "@webtools/slick-server";

import ThemeInit from "../components/theme-init.tsx";
import ThemeToggle from "../islands/theme-toggle.tsx";

export default {
	name: "auth",
	favicon: "/favicon.ico",

	styles: [
		"/styles/reset.css",
		"/styles/tokens.css",
		"/styles/ui.css",
		"/styles/auth.css",
	],
	scripts: [],

	head: <ThemeInit />,
	body: (
		<>
			<header>
				<a class="brand" href="/set-node">
					<img src="/favicon.ico" alt="Magi" width="28" height="28" />
				</a>
				<div class="header-tools">
					<ThemeToggle />
				</div>
			</header>
			<div id="app"></div>
		</>
	),

	onrequest: null,
} satisfies Template;
