import MarkdownContent from "../../../components/markdown-content.tsx";

export default function LectureResume({
	source,
	failed,
}: {
	source: string;
	failed?: boolean | string;
}) {
	if (failed === true || failed === "true") return <p>Impossible de charger la fiche.</p>;
	if (!source) return <p>Pas de fiche pour ce cours.</p>;
	return <MarkdownContent source={source} />;
}
