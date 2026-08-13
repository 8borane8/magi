import { Pause, Play, Square } from "lucide-preact";
import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect } from "preact/hooks";

import { formatDuration } from "../../utils/lecture-format.ts";
import { recordSession, restoreRecordSession } from "../../utils/record-session.ts";

const RECORDING_LABEL: Record<typeof recordSession.status, string | null> = {
	idle: null,
	recording: "Enregistrement en cours",
	paused: "En pause",
	flushing: "Envoi des derniers fragments…",
};

export default function RecordBar() {
	const tick = useSignal(0);
	void tick.value;

	useLayoutEffect(() => {
		restoreRecordSession();
		tick.value++;
	}, []);

	useEffect(() => {
		function onBeforeUnload(event: BeforeUnloadEvent) {
			if (recordSession.status === "idle") return;
			event.preventDefault();
		}

		globalThis.addEventListener("beforeunload", onBeforeUnload);
		const unsubscribe = recordSession.subscribe(() => {
			tick.value++;
		});

		return () => {
			unsubscribe();
			globalThis.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, []);

	if (tick.value === 0 || recordSession.status === "idle") {
		return <div id="record-bar" data-idle="true"></div>;
	}

	const label = RECORDING_LABEL[recordSession.status];

	return (
		<div id="record-bar">
			<p>
				<span>{label}</span>
				<time>{formatDuration(recordSession.elapsedSec)}</time>
			</p>
			<menu>
				{recordSession.status === "paused" && (
					<button
						type="button"
						class="btn"
						aria-label="Reprendre"
						onClick={() => recordSession.resume()}
					>
						<Play size={16} aria-hidden="true" />
						<span>Reprendre</span>
					</button>
				)}
				{recordSession.status === "recording" && (
					<button
						type="button"
						class="btn"
						aria-label="Pause"
						onClick={() => recordSession.pause()}
					>
						<Pause size={16} aria-hidden="true" />
						<span>Pause</span>
					</button>
				)}
				<button
					type="button"
					class="btn btn-danger"
					aria-label="Arrêter"
					disabled={recordSession.status === "flushing"}
					onClick={() => recordSession.stop()}
				>
					<Square size={16} aria-hidden="true" />
					<span>Arrêter</span>
				</button>
			</menu>
			{recordSession.error && <p class="error">{recordSession.error}</p>}
		</div>
	);
}
