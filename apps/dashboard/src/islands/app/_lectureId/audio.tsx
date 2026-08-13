import { useSignal } from "@preact/signals";
import { Pause, Play } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import { formatDuration } from "../../../utils/lecture-format.ts";

function totalDuration(audio: HTMLAudioElement, fallbackSec: number | null): number {
	const fromFile = audio.duration;
	if (Number.isFinite(fromFile) && fromFile > 0) return fromFile;
	return fallbackSec ?? 0;
}

export default function LectureAudio({
	src,
	durationSec,
}: {
	src: string;
	durationSec: number | null;
}) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const playing = useSignal(false);
	const currentSec = useSignal(0);
	const totalSec = useSignal(durationSec ?? 0);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const sync = () => {
			currentSec.value = audio.currentTime;
			totalSec.value = totalDuration(audio, durationSec);
		};

		audio.addEventListener("timeupdate", sync);
		audio.addEventListener("loadedmetadata", sync);
		audio.addEventListener("durationchange", sync);
		audio.addEventListener("play", () => {
			playing.value = true;
		});
		audio.addEventListener("pause", () => {
			playing.value = false;
		});
		audio.addEventListener("ended", () => {
			playing.value = false;
		});

		sync();

		return () => {
			audio.removeEventListener("timeupdate", sync);
			audio.removeEventListener("loadedmetadata", sync);
			audio.removeEventListener("durationchange", sync);
		};
	}, [durationSec]);

	function toggle() {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) void audio.play();
		else audio.pause();
	}

	function seek(event: Event) {
		const audio = audioRef.current;
		if (!audio || totalSec.value <= 0) return;
		audio.currentTime = Number((event.target as HTMLInputElement).value);
		currentSec.value = audio.currentTime;
	}

	const total = totalSec.value;
	const current = currentSec.value;
	const progress = total > 0 ? (current / total) * 100 : 0;

	return (
		<div class="lecture-audio">
			<audio ref={audioRef} preload="metadata" src={src} />
			<button
				type="button"
				class="btn btn-icon"
				aria-label={playing.value ? "Pause" : "Lecture"}
				disabled={total <= 0}
				onClick={toggle}
			>
				{playing.value ? <Pause size={16} /> : <Play size={16} />}
			</button>
			<input
				type="range"
				min={0}
				max={total || 1}
				step={0.1}
				value={current}
				disabled={total <= 0}
				aria-valuemin={0}
				aria-valuemax={total}
				aria-valuenow={current}
				style={{ "--progress": `${progress}%` }}
				onInput={seek}
			/>
			<time class="lecture-audio-time">
				{formatDuration(Math.floor(current))} / {formatDuration(total > 0 ? Math.floor(total) : null)}
			</time>
		</div>
	);
}
