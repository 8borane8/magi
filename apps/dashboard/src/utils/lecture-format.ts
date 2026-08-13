import { SessionStatus } from "@magi/shared/types/session";

export const STATUS_LABEL: Record<SessionStatus, string> = {
	[SessionStatus.RECORDING]: "En cours",
	[SessionStatus.PAUSED]: "En pause",
	[SessionStatus.PROCESSING]: "Traitement",
	[SessionStatus.COMPLETED]: "Terminé",
	[SessionStatus.FAILED]: "Échec",
};

export function formatDate(value: string | Date): string {
	return new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDuration(sec: number | null): string {
	if (sec == null) return "-";
	const minutes = Math.floor(sec / 60);
	return `${minutes}:${String(sec % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number | null): string {
	if (bytes == null) return "-";
	if (bytes < 1024) return `${bytes} o`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function lectureTitle(lecture: { title: string | null; createdAt: string | Date }): string {
	return lecture.title?.trim() || formatDate(lecture.createdAt);
}

export function lectureIdFromUrl(url: string): string {
	const path = url.split("?")[0] ?? url;
	return path.split("/").pop() ?? "";
}
