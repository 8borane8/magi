import { useSignal } from "@preact/signals";
import { Plus, Trash2, X } from "lucide-preact";
import { useRef } from "preact/hooks";

import { homeHref } from "../utils/home-query.ts";
import ColorField from "./color-field.tsx";
import { EMPTY_HOME_FILTERS } from "./home-filters.tsx";

export type CatalogDraft = {
	id: string | null;
	name: string;
	color: string;
};

export type CatalogRow = {
	id: string;
	name: string;
	color: string;
	lectureCount: number;
};

export type CatalogCopy = {
	heading: string;
	intro: string;
	createLabel: string;
	createTitle: string;
	editTitle: string;
	deleteTitle: string;
	empty: string;
	namePlaceholder: string;
	nameMax: number;
};

export default function CatalogPage({
	kind,
	copy,
	items,
	draft,
	loadError,
	formError,
	onDraft,
	onSubmit,
	onReset,
	onEdit,
	onDelete,
}: {
	kind: "subjects" | "tags";
	copy: CatalogCopy;
	items: CatalogRow[];
	draft: CatalogDraft;
	loadError: string | null;
	formError: string | null;
	onDraft: (draft: CatalogDraft) => void;
	onSubmit: (event: Event) => Promise<boolean>;
	onReset: () => void;
	onEdit: (item: CatalogRow) => void;
	onDelete: (item: CatalogRow) => Promise<boolean>;
}) {
	const query = useSignal("");
	const pending = useSignal<CatalogRow | null>(null);
	const editRef = useRef<HTMLDialogElement>(null);
	const deleteRef = useRef<HTMLDialogElement>(null);
	const nameRef = useRef<HTMLInputElement>(null);

	const patch = (part: Partial<CatalogDraft>) => onDraft({ ...draft, ...part });
	const needle = query.value.trim().toLowerCase();
	const visible = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;

	function openCreate() {
		onReset();
		editRef.current?.showModal();
		nameRef.current?.focus();
	}

	function openEdit(item: CatalogRow) {
		onEdit(item);
		editRef.current?.showModal();
		nameRef.current?.focus();
	}

	function closeEdit() {
		editRef.current?.close();
	}

	function askDelete(item: CatalogRow) {
		pending.value = item;
		deleteRef.current?.showModal();
	}

	function closeDelete() {
		deleteRef.current?.close();
		pending.value = null;
	}

	async function handleSubmit(event: Event) {
		if (await onSubmit(event)) closeEdit();
	}

	async function handleDelete() {
		const item = pending.value;
		if (!item) return;
		if (await onDelete(item)) closeDelete();
	}

	function lecturesHref(item: CatalogRow) {
		if (kind === "subjects") {
			return homeHref({ q: "", subject: item.id, filters: { ...EMPTY_HOME_FILTERS } });
		}
		return homeHref({ q: "", subject: "all", filters: { ...EMPTY_HOME_FILTERS, tagId: item.id } });
	}

	return (
		<section id="catalog">
			<h1>{copy.heading}</h1>
			<p>{copy.intro}</p>
			<form
				onSubmit={(event) => {
					event.preventDefault();
				}}
			>
				<label class="field field-search">
					<input
						type="search"
						aria-label="Rechercher"
						placeholder="Rechercher"
						value={query.value}
						onInput={(event) => {
							query.value = (event.target as HTMLInputElement).value;
						}}
					/>
				</label>
				<button type="button" class="btn btn-primary" onClick={openCreate}>
					<Plus size={16} aria-hidden="true" />
					<span>{copy.createLabel}</span>
				</button>
			</form>
			{loadError && <p class="error">{loadError}</p>}
			{items.length === 0 && !loadError && <p>{copy.empty}</p>}
			{items.length > 0 && visible.length === 0 && <p>Aucun résultat pour cette recherche.</p>}
			{visible.length > 0 && (
				<ul>
					{visible.map((item) => (
						<li key={item.id}>
							<button type="button" onClick={() => openEdit(item)}>
								<span class="swatch" style={{ background: item.color }}></span>
								<span>{item.name}</span>
							</button>
							<a href={lecturesHref(item)} class="pill">
								{item.lectureCount} cours
							</a>
							<button
								type="button"
								class="btn btn-icon btn-danger"
								aria-label={`Supprimer ${item.name}`}
								onClick={() => askDelete(item)}
							>
								<Trash2 size={16} aria-hidden="true" />
							</button>
						</li>
					))}
				</ul>
			)}

			<dialog ref={editRef} onClose={onReset}>
				<form onSubmit={handleSubmit}>
					<header>
						<h2>{draft.id ? copy.editTitle : copy.createTitle}</h2>
						<button type="button" class="btn btn-icon" aria-label="Fermer" onClick={closeEdit}>
							<X size={16} />
						</button>
					</header>
					<div>
						<label class="field">
							<span>Nom</span>
							<input
								ref={nameRef}
								type="text"
								required
								maxLength={copy.nameMax}
								placeholder={copy.namePlaceholder}
								value={draft.name}
								onInput={(event) => patch({ name: (event.target as HTMLInputElement).value })}
							/>
						</label>
						<ColorField
							value={draft.color}
							placeholder="#3e4a9a"
							onInput={(color) => patch({ color })}
						/>
						{formError && <p class="error">{formError}</p>}
					</div>
					<footer>
						<button type="button" class="btn" onClick={closeEdit}>Annuler</button>
						<button type="submit" class="btn btn-primary">Enregistrer</button>
					</footer>
				</form>
			</dialog>

			<dialog ref={deleteRef} onClose={() => pending.value = null}>
				<header>
					<h2>{copy.deleteTitle}</h2>
					<button type="button" class="btn btn-icon" aria-label="Fermer" onClick={closeDelete}>
						<X size={16} />
					</button>
				</header>
				<div>
					<p>
						{pending.value ? `Supprimer « ${pending.value.name} » ? Cette action est irréversible.` : ""}
					</p>
					{formError && <p class="error">{formError}</p>}
				</div>
				<footer>
					<button type="button" class="btn" onClick={closeDelete}>Annuler</button>
					<button type="button" class="btn btn-danger" onClick={() => void handleDelete()}>
						Supprimer
					</button>
				</footer>
			</dialog>
		</section>
	);
}
