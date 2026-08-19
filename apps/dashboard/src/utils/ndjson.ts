export async function* readNdjson<T>(response: Response): AsyncGenerator<T> {
	if (!response.body) throw new Error("empty_body");

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				yield JSON.parse(trimmed) as T;
			}
		}

		const tail = buffer.trim();
		if (tail) yield JSON.parse(tail) as T;
	} finally {
		reader.releaseLock();
	}
}
