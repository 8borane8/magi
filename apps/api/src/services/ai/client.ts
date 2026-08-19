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
	numPredict?: number;
	think?: boolean;
	signal?: AbortSignal;
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

function throwIfAborted(error: unknown): never {
	if (error instanceof Error && error.name === "AbortError") {
		throw new Error("ollama_timeout");
	}
	throw error;
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

export async function* chatStream(
	messages: OllamaMessage[],
	options: ChatOptions = {},
): AsyncGenerator<string> {
	if (options.signal?.aborted) return;

	const model = options.model || config.ollamaChatModel;
	const timeout = new AbortController();
	const timer = setTimeout(() => timeout.abort(), config.ollamaTimeoutMs);
	const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
	const sampling = {
		...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
		...(options.numPredict !== undefined ? { num_predict: options.numPredict } : {}),
	};

	try {
		const response = await fetch(`${config.ollamaUrl.replace(/\/+$/, "")}/api/chat`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model,
				messages,
				stream: true,
				think: options.think ?? false,
				...(options.format ? { format: options.format } : {}),
				...(Object.keys(sampling).length > 0 ? { options: sampling } : {}),
			}),
			signal,
		});

		if (!response.ok || !response.body) {
			throw contextOrRaw(await readErrorBody(response));
		}

		const decoder = new TextDecoder();
		let buffer = "";

		for await (const chunk of response.body) {
			buffer += decoder.decode(chunk, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (!line.trim()) continue;
				const data = JSON.parse(line) as OllamaChatResponse;
				if (data.error) throw contextOrRaw(data.error);
				const piece = data.message?.content;
				if (piece) yield piece;
			}
		}

		if (buffer.trim()) {
			const data = JSON.parse(buffer) as OllamaChatResponse;
			if (data.error) throw contextOrRaw(data.error);
			const piece = data.message?.content;
			if (piece) yield piece;
		}
	} catch (error) {
		if (options.signal?.aborted) return;
		throwIfAborted(error);
	} finally {
		clearTimeout(timer);
	}
}

export async function chat(messages: OllamaMessage[], options: ChatOptions = {}): Promise<string> {
	let text = "";
	for await (const piece of chatStream(messages, options)) text += piece;
	return text.trim();
}
