import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import MarkdownContent from "../../../components/markdown-content.tsx";

export default function LectureResume() {
	const source = useSignal<string | null>(null);
	const pending = useSignal(true);
	const error = useSignal<string | null>(null);

	useEffect(() => {
		void (async () => {
			try {
				const response = await fetch("/examples/resume.md");
				if (!response.ok) throw new Error("resume_not_found");
				source.value = await response.text();
			} catch {
				error.value = "Impossible de charger le résumé.";
			} finally {
				pending.value = false;
			}
		})();
	}, []);

	return (
		<article>
			{pending.value && <p>Chargement...</p>}
			{error.value && <p class="error">{error.value}</p>}
			{source.value && <MarkdownContent source={source.value} />}
		</article>
	);
}
