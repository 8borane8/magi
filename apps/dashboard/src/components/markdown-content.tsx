import { useEffect, useMemo, useRef } from "preact/hooks";

import { renderMarkdown } from "../utils/markdown.ts";

type Mermaid = {
	initialize: (config: Record<string, unknown>) => void;
	render: (id: string, text: string) => Promise<{ svg: string }>;
};

let mermaidMod: Mermaid | undefined;

async function loadMermaid(): Promise<Mermaid> {
	if (mermaidMod) return mermaidMod;
	const mod = await import("mermaid/dist/mermaid.esm.min.mjs");
	const mermaid = (mod.default ?? mod) as Mermaid;
	mermaid.initialize({
		startOnLoad: false,
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
	mermaidMod = mermaid;
	return mermaid;
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

async function renderDiagrams(root: HTMLElement): Promise<void> {
	const figures = [...root.querySelectorAll<HTMLElement>("figure.diagram[data-definition]")];
	if (figures.length === 0) return;

	const mermaid = await loadMermaid();
	for (const [index, figure] of figures.entries()) {
		if (figure.querySelector("svg")) continue;
		const definition = figure.dataset.definition?.trim();
		if (!definition) continue;
		try {
			const { svg } = await mermaid.render(`mmd${index}${Math.random().toString(36).slice(2, 8)}`, definition);
			figure.innerHTML = svg;
			const drawn = figure.querySelector("svg");
			if (drawn) adoptTheme(drawn);
		} catch (error) {
			console.error(error);
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
