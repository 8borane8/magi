import { ArrowLeft } from "lucide-preact";

export default function LectureBack() {
	return (
		<button type="button" aria-label="Retour" onClick={() => globalThis.history.back()}>
			<ArrowLeft size={16} aria-hidden="true" />
			<span>Retour</span>
		</button>
	);
}
