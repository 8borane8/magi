import CatalogPage from "../../components/catalog-page.tsx";
import { useCatalog } from "../../utils/use-catalog.ts";

export default function Tags() {
	const catalog = useCatalog("tags");

	return (
		<CatalogPage
			pageId="tags"
			heading="Étiquettes"
			nameMax={80}
			items={catalog.items.value}
			draft={catalog.draft.value}
			showArchived={catalog.showArchived}
			error={catalog.error.value}
			onDraft={catalog.onDraft}
			onSubmit={catalog.onSubmit}
			onReset={catalog.onReset}
			onEdit={catalog.onEdit}
			onDelete={catalog.onDelete}
		/>
	);
}
