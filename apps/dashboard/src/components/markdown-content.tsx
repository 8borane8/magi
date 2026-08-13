type Block =
	| { kind: "heading"; level: 1 | 2 | 3; text: string }
	| { kind: "paragraph"; text: string }
	| { kind: "list"; items: string[] };

function parseBlocks(source: string): Block[] {
	const blocks: Block[] = [];
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	let index = 0;

	while (index < lines.length) {
		const line = lines[index]?.trim() ?? "";
		if (!line) {
			index++;
			continue;
		}

		const heading = line.match(/^(#{1,3})\s+(.+)$/);
		if (heading) {
			blocks.push({
				kind: "heading",
				level: heading[1].length as 1 | 2 | 3,
				text: heading[2],
			});
			index++;
			continue;
		}

		if (line.startsWith("- ")) {
			const items: string[] = [];
			while (index < lines.length && (lines[index]?.trim() ?? "").startsWith("- ")) {
				items.push((lines[index]?.trim() ?? "").slice(2));
				index++;
			}
			blocks.push({ kind: "list", items });
			continue;
		}

		const paragraph: string[] = [line];
		index++;
		while (index < lines.length) {
			const next = lines[index]?.trim() ?? "";
			if (!next || next.startsWith("#") || next.startsWith("- ")) break;
			paragraph.push(next);
			index++;
		}
		blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
	}

	return blocks;
}

function inline(text: string) {
	const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
	return parts.map((part, index) => {
		if (part.startsWith("**") && part.endsWith("**")) {
			return <strong key={index}>{part.slice(2, -2)}</strong>;
		}
		if (part.startsWith("`") && part.endsWith("`")) {
			return <code key={index}>{part.slice(1, -1)}</code>;
		}
		return part;
	});
}

export default function MarkdownContent({ source }: { source: string }) {
	const blocks = parseBlocks(source);

	return (
		<>
			{blocks.map((block, index) => {
				if (block.kind === "heading") {
					if (block.level === 1) return <h2 key={index}>{inline(block.text)}</h2>;
					if (block.level === 2) return <h3 key={index}>{inline(block.text)}</h3>;
					return <h4 key={index}>{inline(block.text)}</h4>;
				}
				if (block.kind === "list") {
					return (
						<ul key={index}>
							{block.items.map((item) => <li key={item}>{inline(item)}</li>)}
						</ul>
					);
				}
				return <p key={index}>{inline(block.text)}</p>;
			})}
		</>
	);
}
