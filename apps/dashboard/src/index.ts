import { Slick } from "@webtools/slick-server";

const app = new Slick(import.meta.dirname!, {
	port: Number(Deno.env.get("DASHBOARD_PORT")!),
	client: true,
	hotReload: Deno.args.includes("--dev"),
	sharedLibs: ["lucide-preact", "@webtools/expressapi", "@magi/api"],
});

await app.start();
