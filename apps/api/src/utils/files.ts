import type { HttpRequest, HttpResponse } from "@webtools/expressapi";
import { serveFile } from "@std/http/file-server";

export async function sendFile(req: HttpRequest, res: HttpResponse, path: string): Promise<Response> {
	const file = await serveFile(req.raw, path);
	if (file.status === 404) {
		return res.status(404).json({
			success: false as const,
			error: "404 Not Found.",
		});
	}

	for (const [name, value] of file.headers) {
		res.setHeader(name, value);
	}

	return res.status(file.status).send(file.body);
}
