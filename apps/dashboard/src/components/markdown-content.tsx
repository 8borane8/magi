import { renderMarkdown } from "../utils/markdown.ts";

export default function MarkdownContent({ source }: { source: string }) {
	return <div class="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}
