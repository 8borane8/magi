export type ChatFileKind = "image" | "pdf" | "text";

const IMAGE_EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	jpg: "jpg",
	jpeg: "jpg",
	png: "png",
	webp: "webp",
	gif: "gif",
};

function extOf(name: string): string {
	return name.split(".").pop()?.toLowerCase() || "";
}

export function chatFileKind(type: string, name: string): ChatFileKind | null {
	const ext = extOf(name);
	if (IMAGE_EXT[type] || IMAGE_EXT[ext]) return "image";
	if (type === "application/pdf" || ext === "pdf") return "pdf";
	if (type === "text/plain" || ext === "txt") return "text";
	return null;
}

export function chatFileExt(kind: ChatFileKind, type: string, name: string): string {
	if (kind === "pdf") return "pdf";
	if (kind === "text") return "txt";
	return IMAGE_EXT[type] || IMAGE_EXT[extOf(name)] || "png";
}
