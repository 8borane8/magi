import mermaid from "https://esm.sh/mermaid@11.12.0?bundle";
import { useEffect, useMemo, useRef } from "preact/hooks";

import { renderMarkdown } from "../utils/markdown.ts";

let mermaidReady = false;
let mermaidSeq = 0;

function setupMermaid(): void {
	if (mermaidReady) return;
	mermaid.initialize({
		startOnLoad: false,
		suppressErrorRendering: true,
		securityLevel: "loose",
		theme: "base",
		fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
			"IBM Plex Sans, sans-serif",
		flowchart: {
			htmlLabels: true,
			useMaxWidth: true,
			padding: 20,
			wrappingWidth: 280,
			nodeSpacing: 56,
			rankSpacing: 56,
			diagramPadding: 12,
		},
		sequence: {
			useMaxWidth: true,
			actorMargin: 48,
			boxMargin: 12,
			messageMargin: 40,
		},
	});
	mermaidReady = true;
}

function adoptTheme(svg: Element): void {
	for (const style of svg.querySelectorAll("style")) style.remove();
	for (const node of svg.querySelectorAll("[style]")) {
		const el = node as HTMLElement;
		el.style.removeProperty("color");
		el.style.removeProperty("fill");
		el.style.removeProperty("stroke");
		el.style.removeProperty("background");
		el.style.removeProperty("background-color");
	}
}

async function copyCode(button: HTMLButtonElement): Promise<void> {
	const text = button.closest(".code-block")?.querySelector("pre > code")?.textContent || "";
	try {
		await navigator.clipboard.writeText(text);
		button.textContent = "Copié";
	} catch {
		button.textContent = "Échec";
	}
	setTimeout(() => {
		button.textContent = "Copier";
	}, 1500);
}

function removeMermaidTemp(id: string): void {
	document.getElementById(id)?.remove();
	document.getElementById(`d${id}`)?.remove();
	document.getElementById(`i${id}`)?.remove();
}

function showDiagramSource(figure: HTMLElement, definition: string): void {
	figure.className = "code-block";
	figure.removeAttribute("data-definition");
	const caption = document.createElement("figcaption");
	const label = document.createElement("span");
	label.textContent = "Mermaid";
	caption.append(label);
	const pre = document.createElement("pre");
	const code = document.createElement("code");
	code.textContent = definition;
	pre.append(code);
	figure.replaceChildren(caption, pre);
}

async function renderDiagrams(root: HTMLElement): Promise<void> {
	const figures = [...root.querySelectorAll<HTMLElement>("figure.diagram[data-definition]")];
	if (figures.length === 0) return;

	setupMermaid();
	for (const figure of figures) {
		if (figure.querySelector("svg")) continue;
		const definition = figure.dataset.definition?.trim();
		if (!definition) continue;
		const id = `mmd${++mermaidSeq}`;
		try {
			const { svg } = await mermaid.render(id, definition);
			figure.innerHTML = svg;
			const drawn = figure.querySelector("svg");
			if (drawn) adoptTheme(drawn);
		} catch {
			showDiagramSource(figure, definition);
		} finally {
			removeMermaidTemp(id);
		}
	}
}

export default function MarkdownContent({ source }: { source: string }) {
	const root = useRef<HTMLDivElement>(null);
	const html = useMemo(() => renderMarkdown(source), [source]);

	useEffect(() => {
		const el = root.current;
		if (!el) return;

		const onClick = (event: Event) => {
			const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
			if (!button || !el.contains(button)) return;
			void copyCode(button);
		};
		el.addEventListener("click", onClick);
		void renderDiagrams(el);

		return () => el.removeEventListener("click", onClick);
	}, [html]);

	return <div ref={root} class="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
