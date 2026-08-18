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

export async function chat(messages: OllamaMessage[], options: ChatOptions = {}): Promise<string> {
	const model = options.model || config.ollamaChatModel;

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 180_000);

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
			throw new Error(`ollama_http_${response.status}`);
		}

		const data = await response.json() as OllamaChatResponse;
		if (data.error) throw new Error(data.error);
		return data.message?.content?.trim() || "";
	} finally {
		clearTimeout(timer);
	}
}
