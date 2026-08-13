import type { Template } from "@webtools/slick-server";
import { Server } from "lucide-preact";

import ThemeInit from "../components/theme-init.tsx";
import RecordBar from "../islands/app/record-bar.tsx";
import ThemeToggle from "../islands/theme-toggle.tsx";
import { createClient } from "../client.ts";

function nodeLabel(nodeUrl: string | undefined): string {
	if (!nodeUrl) return "Noeud";
	try {
		return new URL(nodeUrl).host;
	} catch {
		return nodeUrl;
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

		return (
			<>
				<header>
					<a class="brand" href="/">
						<img src="/favicon.ico" alt="Magi" width="28" height="28" />
					</a>
					<nav>
						<a href="/" aria-current={path === "/" ? "page" : undefined}>Accueil</a>
						<a href="/subjects" aria-current={path === "/subjects" ? "page" : undefined}>Matières</a>
						<a href="/tags" aria-current={path === "/tags" ? "page" : undefined}>Étiquettes</a>
					</nav>
					<div class="header-tools">
						<a
							class="btn btn-icon"
							id="node-status"
							href="/set-node"
							aria-label={`Noeud : ${nodeLabel(req.cookies.nodeUrl)}`}
							title={nodeLabel(req.cookies.nodeUrl)}
						>
							<Server size={16} aria-hidden="true" />
						</a>
						<ThemeToggle />
					</div>
				</header>
				<div id="app"></div>
				<RecordBar />
			</>
		);
	},

	onrequest: async (req, res) => {
		if (!req.cookies.nodeUrl) return res.redirect("/set-node");

		const result = await createClient(req.cookies.nodeUrl).get("/health");
		if (!result.success) return res.redirect("/set-node");
	},
} satisfies Template;
