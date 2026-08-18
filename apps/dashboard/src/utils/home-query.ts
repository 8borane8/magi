import { SessionStatus } from "@magi/shared/types/session";

import { EMPTY_HOME_FILTERS, type HomeFilters } from "../components/home-filters.tsx";

export type HomeQueryState = {
	q: string;
	subject: string;
	filters: HomeFilters;
};

export const EMPTY_HOME_QUERY: HomeQueryState = {
	q: "",
	subject: "all",
	filters: { ...EMPTY_HOME_FILTERS },
};

const STORAGE_KEY = "magi-home";

export function homeHref(state: HomeQueryState): string {
	const params = new URLSearchParams();

	if (state.q) params.set("q", state.q);
	if (state.subject !== "all") params.set("subject", state.subject);
	if (state.filters.tagId) params.set("tag", state.filters.tagId);
	if (state.filters.status) params.set("status", state.filters.status);
	if (state.filters.from) params.set("from", state.filters.from);
	if (state.filters.to) params.set("to", state.filters.to);

	const query = params.toString();
	return query ? `/?${query}` : "/";
}

export function readHomeQuery(search: string): HomeQueryState {
	const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
	const status = params.get("status") || "";

	return {
		q: params.get("q") || "",
		subject: params.get("subject") || "all",
		filters: {
			tagId: params.get("tag") || "",
			status: Object.values(SessionStatus).includes(status as SessionStatus) ? status as SessionStatus : "",
			from: params.get("from") || "",
			to: params.get("to") || "",
		},
	};
}

export function homeHrefFromStorage(): string {
	try {
		const href = sessionStorage.getItem(STORAGE_KEY) || "/";
		return href.startsWith("/") ? href : "/";
	} catch {
		return "/";
	}
}

export function readHomeQueryFromBrowser(): HomeQueryState {
	if (typeof globalThis.location === "undefined") return EMPTY_HOME_QUERY;
	if (globalThis.location.search) return readHomeQuery(globalThis.location.search);

	const stored = homeHrefFromStorage();
	if (stored === "/") return EMPTY_HOME_QUERY;
	try {
		return readHomeQuery(new URL(stored, globalThis.location.origin).search);
	} catch {
		return EMPTY_HOME_QUERY;
	}
}

export function writeHomeQuery(state: HomeQueryState): void {
	const url = homeHref(state);

	try {
		sessionStorage.setItem(STORAGE_KEY, url);
	} catch {
		/* private mode */
	}

	if (typeof globalThis.location === "undefined" || typeof globalThis.history === "undefined") return;
	if (globalThis.location.pathname !== "/") return;
	if (`${globalThis.location.pathname}${globalThis.location.search}` === url) return;
	globalThis.history.replaceState(null, "", url);
}
