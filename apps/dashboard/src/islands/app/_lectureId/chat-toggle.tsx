import { MessageCircle } from "lucide-preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

export default function LectureChatToggle() {
	const open = useSignal(false);

	function syncOpen(next: boolean) {
		open.value = next;
		const root = document.getElementById("lecture");
		if (!root) return;
		if (next) {
			root.setAttribute("data-chat-open", "true");
			root.removeAttribute("data-info-open");
		} else {
			root.removeAttribute("data-chat-open");
		}
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
			id="lecture-chat-toggle"
			class="btn btn-icon"
			aria-label="Prof"
			aria-expanded={open.value}
			aria-controls="lecture-chat"
			onClick={() => {
				const root = document.getElementById("lecture");
				syncOpen(!root?.hasAttribute("data-chat-open"));
			}}
		>
			<MessageCircle size={16} aria-hidden="true" />
		</button>
	);
}
