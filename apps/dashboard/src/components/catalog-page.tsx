import { Pencil, Trash2 } from "lucide-preact";

import ColorField from "./color-field.tsx";

export type CatalogDraft = {
	id: string | null;
	name: string;
	color: string;
	archived: boolean;
};

export type CatalogRow = {
	id: string;
	name: string;
	color: string;
	archived?: boolean;
	lectureCount: number;
};

export default function CatalogPage({
	pageId,
	heading,
	nameMax,
	items,
	draft,
	showArchived,
	error,
	onDraft,
	onSubmit,
	onReset,
	onEdit,
	onDelete,
}: {
	pageId: "subjects" | "tags";
	heading: string;
	nameMax: number;
	items: CatalogRow[];
	draft: CatalogDraft;
	showArchived: boolean;
	error: string | null;
	onDraft: (draft: CatalogDraft) => void;
	onSubmit: (event: Event) => void;
	onReset: () => void;
	onEdit: (item: CatalogRow) => void;
	onDelete: (item: CatalogRow) => void;
}) {
	const patch = (part: Partial<CatalogDraft>) => onDraft({ ...draft, ...part });

	return (
		<section id={pageId}>
			<h1>{heading}</h1>
			<div>
				<form onSubmit={onSubmit}>
					<h2>{draft.id ? "Modifier" : "Nouveau"}</h2>
					<label class="field">
						<span>Nom</span>
						<input
							type="text"
							required
							maxLength={nameMax}
							value={draft.name}
							onInput={(event) => patch({ name: (event.target as HTMLInputElement).value })}
						/>
					</label>
					<ColorField value={draft.color} onInput={(color) => patch({ color })} />
					{showArchived && (
						<label class="check">
							<input
								type="checkbox"
								checked={draft.archived}
								onChange={(event) => patch({ archived: (event.target as HTMLInputElement).checked })}
							/>
							<span>Archivée</span>
						</label>
					)}
					{error && <p class="error">{error}</p>}
					<p>
						<button type="submit" class="btn btn-primary">Enregistrer</button>
						<button type="button" class="btn" onClick={onReset}>Nouveau</button>
					</p>
				</form>
				<table>
					<thead>
						<tr>
							<th>Nom</th>
							<th>Cours</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{items.length === 0 && (
							<tr>
								<td colSpan={3}>Aucun élément pour le moment.</td>
							</tr>
						)}
						{items.map((item) => (
							<tr key={item.id} data-active={draft.id === item.id ? "true" : undefined}>
								<td>
									<span class="catalog-name">
										<span class="swatch" style={{ background: item.color }}></span>
										<span>{item.name}</span>
										{item.archived ? <span class="pill">archivée</span> : null}
									</span>
								</td>
								<td>{item.lectureCount}</td>
								<td>
									<span class="catalog-actions">
										<button
											type="button"
											class="btn btn-icon"
											aria-label={`Modifier ${item.name}`}
											onClick={() => onEdit(item)}
										>
											<Pencil size={16} aria-hidden="true" />
										</button>
										<button
											type="button"
											class="btn btn-icon btn-danger"
											aria-label={`Supprimer ${item.name}`}
											onClick={() => onDelete(item)}
										>
											<Trash2 size={16} aria-hidden="true" />
										</button>
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
