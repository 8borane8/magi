import { extractText, getDocumentProxy } from "unpdf";

export async function readChatDocument(path: string, kind: "pdf" | "text"): Promise<string> {
	if (kind === "text") {
		return await Deno.readTextFile(path);
	}

	try {
		const pdf = await getDocumentProxy(await Deno.readFile(path));
		const result = await extractText(pdf, { mergePages: true });
		const text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text || "";
		return text;
	} catch (error) {
		console.error(error);
		throw new Error("pdf_unreadable");
	}
}
