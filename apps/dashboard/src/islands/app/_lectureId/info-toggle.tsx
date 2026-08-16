import { Info } from "lucide-preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export default function LectureInfoToggle() {
	const open = useSignal(false);

	function syncOpen(next: boolean) {
		open.value = next;
		const root = document.getElementById("lecture");
		if (!root) return;
		if (next) root.setAttribute("data-info-open", "true");
		else root.removeAttribute("data-info-open");
	}

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") syncOpen(false);
		}

		const mq = matchMedia("(max-width: 640px)");
		function onChange() {
			if (!mq.matches) syncOpen(false);
		}

		document.addEventListener("keydown", onKeyDown);
		mq.addEventListener("change", onChange);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			mq.removeEventListener("change", onChange);
		};
	}, []);

	return (
		<button
			type="button"
			id="lecture-info-toggle"
			class="btn btn-icon"
			aria-label="Informations"
			aria-expanded={open.value}
			aria-controls="lecture-meta"
			onClick={() => {
				const root = document.getElementById("lecture");
				syncOpen(!root?.hasAttribute("data-info-open"));
			}}
		>
			<Info size={16} aria-hidden="true" />
		</button>
	);
}
