import CatalogPage, { type CatalogCopy, type CatalogRow } from "../../components/catalog-page.tsx";
import { type CatalogKind, useCatalog } from "../../utils/use-catalog.ts";

const COPY: Record<CatalogKind, CatalogCopy> = {
	subjects: {
		heading: "Matières",
		intro: "Classez vos cours par matière. Magi en propose une à la fin d'un enregistrement.",
		createLabel: "Nouvelle matière",
		createTitle: "Nouvelle matière",
		editTitle: "Modifier la matière",
		deleteTitle: "Supprimer la matière",
		empty: "Aucune matière pour le moment.",
		namePlaceholder: "Ex. Analyse",
		nameMax: 120,
	},
	tags: {
		heading: "Étiquettes",
		intro: "Ajoute un thème ou un chapitre à un cours. Magi en propose aussi à la classification.",
		createLabel: "Nouvelle étiquette",
		createTitle: "Nouvelle étiquette",
		editTitle: "Modifier l'étiquette",
		deleteTitle: "Supprimer l'étiquette",
		empty: "Aucune étiquette pour le moment.",
		namePlaceholder: "Ex. Intégrales",
		nameMax: 80,
	},
};

export default function Catalog({
	kind,
	items,
	loadError,
}: {
	kind: CatalogKind;
	items?: CatalogRow[];
	loadError?: string | null;
}) {
	const catalog = useCatalog(
		kind,
		Array.isArray(items) ? { items, loadError: loadError || null } : undefined,
	);

	return (
		<CatalogPage
			kind={kind}
			copy={COPY[kind]}
			items={catalog.items.value}
			draft={catalog.draft.value}
			loadError={catalog.loadError.value}
			formError={catalog.formError.value}
			onDraft={catalog.onDraft}
			onSubmit={catalog.onSubmit}
			onReset={catalog.onReset}
			onEdit={catalog.onEdit}
			onDelete={catalog.onDelete}
		/>
	);
}
