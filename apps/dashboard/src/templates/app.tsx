import type { Template } from "@webtools/slick-server";
import { Server } from "lucide-preact";

import ThemeInit from "../components/theme-init.tsx";
import RecordBar from "../islands/app/record-bar.tsx";
import ThemeToggle from "../islands/theme-toggle.tsx";
import { nodeUrl } from "../client.ts";

function nodeLabel(url: string | undefined): string {
	if (!url) return "Noeud";
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

export default {
	name: "app",
	favicon: "/favicon.ico",

	styles: [
		"/styles/reset.css",
		"/styles/tokens.css",
		"/styles/ui.css",
		"/styles/app.css",
	],
	scripts: ["/scripts/header.ts"],

	head: <ThemeInit />,
	body: (req) => {
		const path = req.url;
		const url = nodeUrl(req.cookies.nodeUrl);
		const host = nodeLabel(url);

		return (
			<>
				<header data-node-url={url || ""}>
					<a class="brand" href="/">
						<img src="/favicon.ico" alt="Magi" width="28" height="28" />
					</a>
					<nav>
						<a href="/" aria-current={path === "/" ? "page" : undefined}>Accueil</a>
						<a href="/subjects" aria-current={path === "/subjects" ? "page" : undefined}>Matières</a>
						<a href="/tags" aria-current={path === "/tags" ? "page" : undefined}>Étiquettes</a>
					</nav>
					<div class="header-tools">
						{!Deno.env.get("MAGI_NODE_URL") && (
							<a
								class="btn btn-icon"
								href="/set-node"
								aria-label={`Noeud : ${host}`}
								title={host}
							>
								<Server size={16} aria-hidden="true" />
							</a>
						)}
						<ThemeToggle />
					</div>
				</header>
				<div id="app"></div>
				<RecordBar />
			</>
		);
	},

	onrequest: (req, res) => {
		if (!nodeUrl(req.cookies.nodeUrl)) return res.redirect("/set-node");
	},
} satisfies Template;
