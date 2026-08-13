import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { createClient } from "../client.ts";
import type { CatalogDraft, CatalogRow } from "../components/catalog-page.tsx";

const DEFAULT_DRAFT: CatalogDraft = { id: null, name: "", color: "#3e4a9a", archived: false };
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

type CatalogKind = "subjects" | "tags";

const CONFIG = {
	subjects: {
		loadError: "Impossible de charger les matières.",
		deleteConfirm: (name: string) => `Supprimer la matière « ${name} » ?`,
		showArchived: true,
		load: () => createClient().get("/subjects"),
		save: (draft: CatalogDraft) =>
			createClient().put("/subjects", {
				body: {
					id: draft.id ?? undefined,
					name: draft.name.trim(),
					color: draft.color,
					archived: draft.archived,
				},
			}),
		remove: (id: string) => createClient().delete("/subjects/:subjectId", { params: { subjectId: id } }),
		toDraft: (item: CatalogRow): CatalogDraft => ({
			id: item.id,
			name: item.name,
			color: item.color,
			archived: Boolean(item.archived),
		}),
	},
	tags: {
		loadError: "Impossible de charger les étiquettes.",
		deleteConfirm: (name: string) => `Supprimer l'étiquette « ${name} » ?`,
		showArchived: false,
		load: () => createClient().get("/tags"),
		save: (draft: CatalogDraft) =>
			createClient().put("/tags", {
				body: {
					id: draft.id ?? undefined,
					name: draft.name.trim(),
					color: draft.color,
				},
			}),
		remove: (id: string) => createClient().delete("/tags/:tagId", { params: { tagId: id } }),
		toDraft: (item: CatalogRow): CatalogDraft => ({
			id: item.id,
			name: item.name,
			color: item.color,
			archived: false,
		}),
	},
} as const;

export function useCatalog(kind: CatalogKind) {
	const cfg = CONFIG[kind];
	const items = useSignal<CatalogRow[]>([]);
	const draft = useSignal<CatalogDraft>({ ...DEFAULT_DRAFT });
	const error = useSignal<string | null>(null);

	async function refresh() {
		error.value = null;
		try {
			const res = await cfg.load();
			items.value = res.items;
		} catch {
			error.value = cfg.loadError;
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (!HEX_COLOR.test(draft.value.color)) {
			error.value = "La couleur doit être un hexadécimal #RRGGBB.";
			return;
		}
		try {
			await cfg.save(draft.value);
			draft.value = { ...DEFAULT_DRAFT };
			await refresh();
		} catch {
			error.value = "Enregistrement impossible.";
		}
	}

	async function onDelete(item: CatalogRow) {
		if (!confirm(cfg.deleteConfirm(item.name))) return;
		try {
			await cfg.remove(item.id);
			if (draft.value.id === item.id) draft.value = { ...DEFAULT_DRAFT };
			await refresh();
		} catch {
			error.value = "Suppression impossible.";
		}
	}

	return {
		items,
		draft,
		error,
		showArchived: cfg.showArchived,
		onSubmit,
		onDelete,
		onReset: () => {
			draft.value = { ...DEFAULT_DRAFT };
			error.value = null;
		},
		onEdit: (item: CatalogRow) => {
			draft.value = cfg.toDraft(item);
			error.value = null;
		},
		onDraft: (next: CatalogDraft) => {
			draft.value = next;
		},
	};
}
