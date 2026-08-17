import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { createClient } from "../client.ts";
import type { CatalogDraft, CatalogRow } from "../components/catalog-page.tsx";

const DEFAULT_DRAFT: CatalogDraft = { id: null, name: "", color: "#3e4a9a" };
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type CatalogKind = "subjects" | "tags";

const CONFIG = {
	subjects: {
		loadError: "Impossible de charger les matières.",
		load: () => createClient().get("/subjects"),
		save: (draft: CatalogDraft) =>
			createClient().put("/subjects", {
				body: { id: draft.id ?? undefined, name: draft.name.trim(), color: draft.color },
			}),
		remove: (id: string) => createClient().delete("/subjects/:subjectId", { params: { subjectId: id } }),
	},
	tags: {
		loadError: "Impossible de charger les étiquettes.",
		load: () => createClient().get("/tags"),
		save: (draft: CatalogDraft) =>
			createClient().put("/tags", {
				body: { id: draft.id ?? undefined, name: draft.name.trim(), color: draft.color },
			}),
		remove: (id: string) => createClient().delete("/tags/:tagId", { params: { tagId: id } }),
	},
} as const;

export function useCatalog(kind: CatalogKind) {
	const cfg = CONFIG[kind];
	const items = useSignal<CatalogRow[]>([]);
	const draft = useSignal<CatalogDraft>({ ...DEFAULT_DRAFT });
	const loadError = useSignal<string | null>(null);
	const formError = useSignal<string | null>(null);

	async function refresh() {
		loadError.value = null;
		try {
			const res = await cfg.load();
			items.value = res.items;
		} catch {
			loadError.value = cfg.loadError;
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function onSubmit(event: Event): Promise<boolean> {
		event.preventDefault();
		formError.value = null;
		if (!HEX_COLOR.test(draft.value.color)) {
			formError.value = "La couleur doit être un hexadécimal #RRGGBB.";
			return false;
		}
		try {
			await cfg.save(draft.value);
			draft.value = { ...DEFAULT_DRAFT };
			await refresh();
			return true;
		} catch {
			formError.value = "Enregistrement impossible.";
			return false;
		}
	}

	async function onDelete(item: CatalogRow): Promise<boolean> {
		formError.value = null;
		try {
			await cfg.remove(item.id);
			if (draft.value.id === item.id) draft.value = { ...DEFAULT_DRAFT };
			await refresh();
			return true;
		} catch {
			formError.value = "Suppression impossible.";
			return false;
		}
	}

	return {
		items,
		draft,
		loadError,
		formError,
		onSubmit,
		onDelete,
		onReset: () => {
			draft.value = { ...DEFAULT_DRAFT };
			formError.value = null;
		},
		onEdit: (item: CatalogRow) => {
			draft.value = { id: item.id, name: item.name, color: item.color };
			formError.value = null;
		},
		onDraft: (next: CatalogDraft) => {
			draft.value = next;
		},
	};
}
