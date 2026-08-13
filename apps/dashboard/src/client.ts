import type { AppRouter } from "@magi/api";
import { HttpClient } from "@webtools/expressapi";

import { Cookies } from "@webtools/slick-client";

type MagiClient = HttpClient<AppRouter>;

export function createClient(baseUrl = Cookies.get("nodeUrl")): MagiClient {
	if (!baseUrl) throw new Error("No node URL found.");
	return new HttpClient<AppRouter>({ baseUrl });
}

export async function pingNode(baseUrl: string): Promise<boolean> {
	try {
		const result = await createClient(baseUrl).get("/health");
		return result.success === true;
	} catch (error) {
		console.error(error);
		return false;
	}
}
