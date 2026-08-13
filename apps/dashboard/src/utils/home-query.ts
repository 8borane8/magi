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

export function readHomeQuery(search: string): HomeQueryState {
	const params = new URLSearchParams(search);
	const status = params.get("status") ?? "";

	return {
		q: params.get("q") ?? "",
		subject: params.get("subject") ?? "all",
		filters: {
			tagId: params.get("tag") ?? "",
			status: Object.values(SessionStatus).includes(status as SessionStatus) ? status as SessionStatus : "",
			from: params.get("from") ?? "",
			to: params.get("to") ?? "",
		},
	};
}

export function readHomeQueryFromBrowser(): HomeQueryState {
	if (typeof globalThis.location === "undefined") return EMPTY_HOME_QUERY;
	return readHomeQuery(globalThis.location.search);
}

export function writeHomeQuery(state: HomeQueryState): void {
	if (typeof globalThis.location === "undefined" || typeof globalThis.history === "undefined") return;

	const params = new URLSearchParams();

	if (state.q) params.set("q", state.q);
	if (state.subject !== "all") params.set("subject", state.subject);
	if (state.filters.tagId) params.set("tag", state.filters.tagId);
	if (state.filters.status) params.set("status", state.filters.status);
	if (state.filters.from) params.set("from", state.filters.from);
	if (state.filters.to) params.set("to", state.filters.to);

	const query = params.toString();
	const url = query ? `/?${query}` : "/";
	if (`${globalThis.location.pathname}${globalThis.location.search}` !== url) {
		globalThis.history.replaceState(null, "", url);
	}
}
