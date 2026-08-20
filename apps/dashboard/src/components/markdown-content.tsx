import { useEffect, useMemo, useRef } from "preact/hooks";

import { extractMermaidMath, type MermaidMath, renderMarkdown, renderTex } from "../utils/markdown.ts";

type MermaidApi = {
	initialize: (config: Record<string, unknown>) => void;
	render: (id: string, definition: string) => Promise<{ svg: string }>;
};

const MERMAID_HREF = "https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.esm.min.mjs";

let mermaid: Promise<MermaidApi> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function loadMermaid(): Promise<MermaidApi> {
	if (!mermaid) {
		const href = MERMAID_HREF;
		mermaid = import(href).then((mod) => {
			const api = (mod as { default?: MermaidApi }).default ?? (mod as unknown as MermaidApi);
			if (typeof api.render !== "function") throw new Error("mermaid_load_failed");
			api.initialize({
				startOnLoad: false,
				suppressErrorRendering: true,
				securityLevel: "loose",
				theme: "base",
				fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim() ||
					"IBM Plex Sans, sans-serif",
				fontSize: 14,
				flowchart: { htmlLabels: true, useMaxWidth: false, padding: 8 },
			});
			return api;
		}).catch((error) => {
			mermaid = undefined;
			throw error;
		});
	}
	return mermaid;
}

function draw(definition: string): Promise<string> {
	const job = queue.then(async () => {
		const api = await loadMermaid();
		const { svg } = await api.render(`mmd${crypto.randomUUID().replaceAll("-", "")}`, definition);
		return svg;
	});
	queue = job.then(() => undefined, () => undefined);
	return job;
}

function paintSvg(svg: SVGSVGElement): void {
	for (const style of svg.querySelectorAll("style")) style.remove();
	svg.style.removeProperty("max-width");
	for (const group of [svg.querySelectorAll(".pieCircle"), svg.querySelectorAll(".legend rect")]) {
		[...group].forEach((el, i) => {
			el.setAttribute("data-tone", String(i % 6));
			(el as HTMLElement).style.removeProperty("fill");
			(el as HTMLElement).style.removeProperty("stroke");
			el.removeAttribute("fill");
			el.removeAttribute("stroke");
		});
	}
	for (const fo of svg.querySelectorAll("foreignObject")) {
		const box = fo.firstElementChild as HTMLElement | null;
		if (!box) continue;
		box.style.display = "flex";
		box.style.flexDirection = "column";
		box.style.justifyContent = "center";
		box.style.alignItems = "center";
		box.style.width = "100%";
		box.style.height = "100%";
		box.style.margin = "0";
		box.style.padding = "0";
		box.style.textAlign = "center";
	}
	const { width, height } = svg.viewBox.baseVal;
	if (width && height) {
		svg.setAttribute("width", String(Math.ceil(width)));
		svg.setAttribute("height", String(Math.ceil(height)));
	}
}

function injectMermaidMath(svg: SVGSVGElement, maths: MermaidMath[]): void {
	for (const { id, tex } of maths) {
		const html = renderTex(tex, false);
		const walker = document.createTreeWalker(svg, NodeFilter.SHOW_TEXT);
		const nodes: Text[] = [];
		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			if (node.nodeValue?.includes(id)) nodes.push(node);
		}
		for (const node of nodes) {
			const parent = node.parentElement;
			const tag = parent?.tagName.toLowerCase();
			if (tag === "text" || tag === "tspan") {
				node.nodeValue = node.nodeValue!.replaceAll(id, tex);
				continue;
			}
			const parts = node.nodeValue!.split(id);
			const frag = document.createDocumentFragment();
			for (let i = 0; i < parts.length; i++) {
				if (parts[i]) frag.append(parts[i]);
				if (i < parts.length - 1) {
					const holder = document.createElement("span");
					holder.innerHTML = html;
					while (holder.firstChild) frag.append(holder.firstChild);
				}
			}
			node.replaceWith(frag);
		}
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

function failDiagram(figure: HTMLElement, definition: string): void {
	figure.className = "code-block";
	figure.removeAttribute("data-definition");
	figure.innerHTML = "<figcaption><span>Mermaid</span></figcaption><pre><code></code></pre>";
	figure.querySelector("code")!.textContent = definition;
}

async function renderDiagrams(root: HTMLElement): Promise<void> {
	for (const figure of [...root.querySelectorAll<HTMLElement>("figure.diagram[data-definition]")]) {
		const definition = figure.dataset.definition?.trim();
		if (!definition || figure.querySelector("svg")) continue;
		try {
			const { source, maths } = extractMermaidMath(definition);
			const svg = await draw(source);
			if (!root.contains(figure)) continue;
			figure.innerHTML = svg;
			const drawn = figure.querySelector("svg");
			if (drawn) {
				paintSvg(drawn);
				if (maths.length) injectMermaidMath(drawn, maths);
			}
		} catch {
			if (root.contains(figure)) failDiagram(figure, definition);
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
			if (button && el.contains(button)) void copyCode(button);
		};
		el.addEventListener("click", onClick);
		void renderDiagrams(el);
		return () => el.removeEventListener("click", onClick);
	}, [html]);

	return <div ref={root} class="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
