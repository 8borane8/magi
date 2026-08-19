import type { HttpResponse } from "@webtools/expressapi";

export function sendNdjson(
	res: HttpResponse,
	run: (send: (obj: unknown) => void, signal: AbortSignal) => Promise<void>,
): Response {
	const encoder = new TextEncoder();
	const abort = new AbortController();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (obj: unknown) => {
				if (abort.signal.aborted) return;
				try {
					controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
				} catch {
					abort.abort();
				}
			};
			try {
				await run(send, abort.signal);
			} catch (error) {
				if (!abort.signal.aborted) {
					console.error(error);
					send({ type: "error", error: error instanceof Error ? error.message : "error" });
				}
			} finally {
				try {
					controller.close();
				} catch {
					// Already closed.
				}
			}
		},
		cancel() {
			abort.abort();
		},
	});

	return res
		.setHeader("Content-Type", "application/x-ndjson")
		.setHeader("Cache-Control", "no-cache")
		.send(stream);
}
