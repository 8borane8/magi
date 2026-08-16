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
				const index = src.indexOf("$$");
				return index < 0 ? undefined : index;
			},
			tokenizer(src) {
				const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$/.exec(src);
				if (!match) return;
				return {
					type: "mathBlock",
					raw: match[0],
					text: match[1] ?? "",
				};
			},
			renderer(token) {
				return renderTex(String((token as unknown as { text: string }).text), true);
			},
		},
		{
			name: "mathInline",
			level: "inline",
			start(src) {
				const index = src.indexOf("$");
				return index < 0 ? undefined : index;
			},
			tokenizer(src) {
				if (src.startsWith("$$")) return;
				const match = /^\$([^$\n]+?)\$/.exec(src);
				if (!match) return;
				return {
					type: "mathInline",
					raw: match[0],
					text: match[1] ?? "",
				};
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
		link({ href, title, tokens }) {
			const inner = this.parser.parseInline(tokens);
			if (href.startsWith("/l/")) {
				return `<a href="${href}" class="fiche-ref" title="Cours lié (exemple)">${inner}</a>`;
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
