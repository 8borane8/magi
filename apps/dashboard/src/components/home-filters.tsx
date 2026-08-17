import { SessionStatus } from "@magi/shared/types/session";
import type { Signal } from "@preact/signals";

import DateRangePicker from "./date-range-picker.tsx";
import { STATUS_LABEL } from "../utils/lecture-format.ts";

export type HomeFilters = {
	tagId: string;
	status: "" | SessionStatus;
	from: string;
	to: string;
};

export const EMPTY_HOME_FILTERS: HomeFilters = { tagId: "", status: "", from: "", to: "" };

type TagChip = { id: string; name: string; color: string };

export default function HomeFilters({
	tags,
	draft,
	onReset,
	onApply,
}: {
	tags: TagChip[];
	draft: Signal<HomeFilters>;
	onReset: () => void;
	onApply: () => void;
}) {
	return (
		<div id="home-filters" role="dialog" aria-label="Filtres">
			<p>Étiquettes</p>
			<div class="tag-chips">
				{tags.length === 0 && <span class="tag-chips-empty">Aucune étiquette</span>}
				{tags.map((tag) => (
					<button
						type="button"
						key={tag.id}
						class="tag-chip"
						data-selected={draft.value.tagId === tag.id ? "true" : undefined}
						onClick={() =>
							draft.value = {
								...draft.value,
								tagId: draft.value.tagId === tag.id ? "" : tag.id,
							}}
					>
						<span class="swatch" style={{ background: tag.color }}></span>
						{tag.name}
					</button>
				))}
			</div>
			<label class="field">
				<span>Statut</span>
				<select
					value={draft.value.status}
					onChange={(event) =>
						draft.value = {
							...draft.value,
							status: (event.target as HTMLSelectElement).value as "" | SessionStatus,
						}}
				>
					<option value="">Tous</option>
					{Object.entries(STATUS_LABEL).map(([value, label]) => (
						<option key={value} value={value}>{label}</option>
					))}
				</select>
			</label>
			<p>Période</p>
			<DateRangePicker
				from={draft.value.from}
				to={draft.value.to}
				onChange={(from, to) => draft.value = { ...draft.value, from, to }}
			/>
			<div>
				<button type="button" class="btn" onClick={onReset}>Réinitialiser</button>
				<button type="button" class="btn btn-primary" onClick={onApply}>Valider</button>
			</div>
		</div>
	);
}
