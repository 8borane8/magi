import { config } from "@/config.ts";

export type OllamaMessage = {
	role: string;
	content: string;
	images?: string[];
};

export type ChatOptions = {
	model?: string;
	format?: "json";
	temperature?: number;
};

type OllamaChatResponse = {
	message?: { content?: string };
	error?: string;
};

function isContextOverflow(message: string): boolean {
	const lower = message.toLowerCase();
	return lower.includes("context length") ||
		lower.includes("exceeds context") ||
		lower.includes("context window") ||
		lower.includes("prompt too long") ||
		lower.includes("too many tokens");
}

function contextOrRaw(message: string): Error {
	return new Error(isContextOverflow(message) ? "context_exceeded" : message);
}

async function readErrorBody(response: Response): Promise<string> {
	try {
		const data = await response.json() as OllamaChatResponse;
		if (data.error) return data.error;
	} catch {
		// Body is not JSON.
	}
	return `ollama_http_${response.status}`;
}

export async function chat(messages: OllamaMessage[], options: ChatOptions = {}): Promise<string> {
	const model = options.model || config.ollamaChatModel;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 360_000);

	try {
		const response = await fetch(`${config.ollamaUrl.replace(/\/+$/, "")}/api/chat`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model,
				messages,
				stream: false,
				...(options.format ? { format: options.format } : {}),
				...(options.temperature !== undefined ? { options: { temperature: options.temperature } } : {}),
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			throw contextOrRaw(await readErrorBody(response));
		}

		const data = await response.json() as OllamaChatResponse;
		if (data.error) throw contextOrRaw(data.error);
		return data.message?.content?.trim() || "";
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("ollama_timeout");
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
