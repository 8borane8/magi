import { Pause, Play, Square } from "lucide-preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { formatDuration } from "../../utils/lecture-format.ts";
import { recordSession } from "../../utils/record-session.ts";

const STATUS_LABEL = {
	recording: "Enregistrement en cours",
	paused: "En pause",
	stopping: "Envoi des derniers fragments...",
} as const;

export default function RecordBar() {
	const tick = useSignal(0);
	void tick.value;

	const { status, offline, error, elapsedSec } = recordSession;

	useEffect(() => {
		const root = document.getElementById("root");

		function sync() {
			tick.value++;
			root?.toggleAttribute("data-recording", recordSession.status !== "idle");
		}

		function onBeforeUnload(event: BeforeUnloadEvent) {
			if (recordSession.status === "idle") return;
			event.preventDefault();
		}

		sync();
		globalThis.addEventListener("beforeunload", onBeforeUnload);
		const unsubscribe = recordSession.subscribe(sync);

		return () => {
			unsubscribe();
			globalThis.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, []);

	if (status === "idle") return <div id="record-bar" data-idle="true"></div>;

	return (
		<div id="record-bar" data-offline={offline ? "true" : undefined}>
			<p>
				<span>{offline ? "Hors ligne, envoi dès que possible" : STATUS_LABEL[status]}</span>
				<time>{formatDuration(elapsedSec * 1_000)}</time>
			</p>
			<menu>
				{status === "paused" && (
					<li>
						<button type="button" class="btn" aria-label="Reprendre" onClick={() => recordSession.resume()}>
							<Play size={16} aria-hidden="true" />
							<span>Reprendre</span>
						</button>
					</li>
				)}
				{status === "recording" && (
					<li>
						<button type="button" class="btn" aria-label="Pause" onClick={() => recordSession.pause()}>
							<Pause size={16} aria-hidden="true" />
							<span>Pause</span>
						</button>
					</li>
				)}
				<li>
					<button
						type="button"
						class="btn btn-danger"
						aria-label="Arrêter"
						disabled={status === "stopping"}
						onClick={() => recordSession.stop()}
					>
						<Square size={16} aria-hidden="true" />
						<span>Arrêter</span>
					</button>
				</li>
			</menu>
			{error && <p class="error">{error}</p>}
		</div>
	);
}
