import hljs from "highlight.js";
import katex from "katex";
import { Marked, type Token, type Tokens } from "marked";

type CalloutVariant =
	| "definition"
	| "theorem"
	| "property"
	| "demo"
	| "warning"
	| "remember"
	| "related"
	| "meta";

const CALLOUT_ALIASES: Record<string, CalloutVariant> = {
	definition: "definition",
	définition: "definition",
	def: "definition",
	theorem: "theorem",
	théorème: "theorem",
	thm: "theorem",
	property: "property",
	propriété: "property",
	prop: "property",
	demo: "demo",
	démonstration: "demo",
	warning: "warning",
	attention: "warning",
	piège: "warning",
	remember: "remember",
	retenir: "remember",
	related: "related",
	liens: "related",
	meta: "meta",
	fiche: "meta",
};

const CALLOUT_LABEL: Record<CalloutVariant, string> = {
	definition: "Définition",
	theorem: "Théorème",
	property: "Propriété",
	demo: "Démonstration",
	warning: "Attention",
	remember: "À retenir",
	related: "Voir aussi",
	meta: "Fiche",
};

const KATEX = {
	throwOnError: false,
	strict: "ignore" as const,
	trust: false,
	output: "html" as const,
};

function renderTex(tex: string, displayMode: boolean): string {
	return katex.renderToString(tex.trim(), { ...KATEX, displayMode });
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function langLabel(lang: string): string {
	if (!lang) return "Code";
	const names: Record<string, string> = {
		cpp: "C++",
		"c++": "C++",
		csharp: "C#",
		cs: "C#",
		js: "JavaScript",
		ts: "TypeScript",
		py: "Python",
	};
	return names[lang] ?? lang[0]!.toUpperCase() + lang.slice(1);
}

function earliest(src: string, needles: string[]): number | undefined {
	let best = -1;
	for (const needle of needles) {
		const index = src.indexOf(needle);
		if (index >= 0 && (best < 0 || index < best)) best = index;
	}
	return best < 0 ? undefined : best;
}

const MERMAID_LANG = new Set(["mermaid", "mmd"]);
const MERMAID_START =
	/^(?:%%\{[\s\S]*?\}%%\s*|%%[^\n]*\n)*\s*(?:flowchart(?:\s+(?:TD|TB|BT|RL|LR))?|graph\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|mindmap|timeline|gitGraph|pie(?:\s+showData)?|gantt|journey|quadrantChart|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|C4Context|requirementDiagram|packet(?:-beta)?|kanban|architecture(?:-beta)?)\b/;

function mermaidSource(text: string): string {
	return text.trim().replace(/^mermaid\s*\r?\n/i, "").trim();
}

function isMermaidFence(language: string, source: string): boolean {
	if (MERMAID_LANG.has(language)) return true;
	if (language && language !== "text" && language !== "txt" && language !== "plain") return false;
	return MERMAID_START.test(source);
}

function highlightCode(text: string, lang: string | undefined): string {
	const language = lang?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
	const source = mermaidSource(text);
	if (isMermaidFence(language, source)) {
		return `<figure class="diagram" data-definition="${escapeHtml(source)}"></figure>\n`;
	}
	if (language === "latex" || language === "tex" || language === "math" || language === "katex") {
		return renderTex(text, true);
	}

	let html = escapeHtml(text);
	try {
		if (language && hljs.getLanguage(language)) {
			html = hljs.highlight(text, { language }).value;
		}
	} catch {
		/* keep escaped */
	}

	const cls = language ? ` language-${escapeHtml(language)}` : "";
	return `<figure class="code-block"><figcaption><span>${
		escapeHtml(langLabel(language))
	}</span><button type="button" data-copy>Copier</button></figcaption><pre><code class="hljs${cls}">${html}</code></pre></figure>\n`;
}

function isImageParagraph(token: Token): token is Tokens.Paragraph {
	if (token.type !== "paragraph" || token.tokens?.length !== 1) return false;
	return token.tokens[0]?.type === "image";
}

function isEmphasisParagraph(token: Token): token is Tokens.Paragraph {
	if (token.type !== "paragraph" || !token.tokens?.length) return false;
	return token.tokens.every((child) => child.type === "em" || (child.type === "text" && !child.text.trim()));
}

function wrapFigures(tokens: Token[]): Token[] {
	const next: Token[] = [];

	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index]!;

		if ("tokens" in token && Array.isArray(token.tokens) && token.type !== "paragraph") {
			token.tokens = wrapFigures(token.tokens as Token[]);
		}

		if (isImageParagraph(token)) {
			let cursor = index + 1;
			while (tokens[cursor]?.type === "space") cursor++;
			const following = tokens[cursor];
			if (following && isEmphasisParagraph(following)) {
				const image = token.tokens[0] as Tokens.Image;
				const caption = following.tokens.filter((child) => child.type === "em") as Tokens.Em[];
				next.push({
					type: "figure",
					raw: token.raw + following.raw,
					href: image.href,
					alt: image.text,
					tokens: caption.flatMap((item) => item.tokens ?? []),
				} as Token);
				index = cursor;
				continue;
			}
		}

		next.push(token);
	}

	return next;
}

function takeCallout(token: Tokens.Blockquote): { variant: CalloutVariant; titled: boolean; tokens: Token[] } | null {
	const children = token.tokens ?? [];
	const first = children[0];
	if (!first || first.type !== "paragraph" || !first.tokens?.length) return null;

	const lead = first.tokens[0];
	if (!lead || lead.type !== "text") return null;

	const match = lead.text.match(/^\[!([^\]]+)\][ \t]*/);
	if (!match?.[1]) return null;

	const variant = CALLOUT_ALIASES[match[1].trim().toLowerCase()];
	if (!variant) return null;

	const rest = lead.text.slice(match[0].length);
	const inline = [...first.tokens];
	if (rest) inline[0] = { ...lead, text: rest, raw: rest };
	else inline.shift();

	const titled = inline.length > 0;
	const tokens = children.slice(1);
	if (titled) {
		tokens.unshift({ ...first, tokens: inline, text: rest });
	}

	return { variant, titled, tokens };
}

const marked = new Marked();

marked.use({
	gfm: true,
	breaks: false,
	hooks: {
		processAllTokens(tokens) {
			return wrapFigures(tokens);
		},
	},
	extensions: [
		{
			name: "mathBlock",
			level: "block",
			start(src) {
				return earliest(src, ["$$", "\\["]);
			},
			tokenizer(src) {
				const dollars = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$/.exec(src);
				if (dollars) {
					return { type: "mathBlock", raw: dollars[0], text: dollars[1] ?? "" };
				}
				const brackets = /^\\\[[ \t]*\n?([\s\S]+?)\n?\\\]/.exec(src);
				if (brackets) {
					return { type: "mathBlock", raw: brackets[0], text: brackets[1] ?? "" };
				}
			},
			renderer(token) {
				return renderTex(String((token as unknown as { text: string }).text), true);
			},
		},
		{
			name: "mathInline",
			level: "inline",
			start(src) {
				return earliest(src, ["$", "\\(", "\\["]);
			},
			tokenizer(src) {
				if (src.startsWith("$$")) return;
				const dollars = /^\$([^$\n]+?)\$/.exec(src);
				if (dollars) {
					return { type: "mathInline", raw: dollars[0], text: dollars[1] ?? "" };
				}
				const parens = /^\\\(([\s\S]+?)\\\)/.exec(src);
				if (parens) {
					return { type: "mathInline", raw: parens[0], text: parens[1] ?? "" };
				}
				const brackets = /^\\\[[ \t]*\n?([\s\S]+?)\n?\\\]/.exec(src);
				if (brackets) {
					return { type: "mathBlock", raw: brackets[0], text: brackets[1] ?? "" };
				}
			},
			renderer(token) {
				return renderTex(String((token as unknown as { text: string }).text), false);
			},
		},
		{
			name: "markKind",
			level: "inline",
			start(src) {
				const match = src.match(/\{(?:def|thm|prop|warn|demo)\}/);
				return match?.index;
			},
			tokenizer(src) {
				const match = /^\{(def|thm|prop|warn|demo)\}([\s\S]+?)\{\/\1\}/.exec(src);
				if (!match) return;
				return {
					type: "markKind",
					raw: match[0],
					kind: match[1],
					tokens: this.lexer.inlineTokens(match[2] ?? ""),
				};
			},
			renderer(token) {
				const item = token as unknown as { kind: string; tokens: Token[] };
				return `<mark data-kind="${item.kind}">${this.parser.parseInline(item.tokens)}</mark>`;
			},
		},
		{
			name: "highlight",
			level: "inline",
			start(src) {
				const index = src.indexOf("==");
				return index < 0 ? undefined : index;
			},
			tokenizer(src) {
				const match = /^==([^=]+)==/.exec(src);
				if (!match) return;
				return {
					type: "highlight",
					raw: match[0],
					tokens: this.lexer.inlineTokens(match[1] ?? ""),
				};
			},
			renderer(token) {
				const item = token as unknown as { tokens: Token[] };
				return `<mark>${this.parser.parseInline(item.tokens)}</mark>`;
			},
		},
		{
			name: "figure",
			renderer(token) {
				const item = token as unknown as { href: string; alt: string; tokens?: Token[] };
				const caption = item.tokens?.length ? this.parser.parseInline(item.tokens) : "";
				return `<figure><img src="${item.href}" alt="${item.alt}"><figcaption>${caption}</figcaption></figure>\n`;
			},
		},
	],
	renderer: {
		heading({ tokens, depth }) {
			const level = Math.min(depth + 1, 4);
			return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
		},
		code({ text, lang }) {
			return highlightCode(text, lang);
		},
		link({ href, title, tokens }) {
			const inner = this.parser.parseInline(tokens);
			if (href.startsWith("/l/")) {
				return `<a href="${href}" class="fiche-ref">${inner}</a>`;
			}
			const titleAttr = title ? ` title="${title}"` : "";
			return `<a href="${href}"${titleAttr}>${inner}</a>`;
		},
		blockquote({ tokens }) {
			const callout = takeCallout({ type: "blockquote", raw: "", tokens, text: "" });
			if (!callout) {
				return `<blockquote>\n${this.parser.parse(tokens)}</blockquote>\n`;
			}

			const titled = callout.titled ? ` data-titled=""` : "";
			const body = this.parser.parse(callout.tokens);
			return `<aside class="fiche-box" data-kind="${callout.variant}"${titled}><p>${
				CALLOUT_LABEL[callout.variant]
			}</p>${body}</aside>\n`;
		},
	},
});

export function renderMarkdown(source: string): string {
	return marked.parse(source, { async: false }) as string;
}
