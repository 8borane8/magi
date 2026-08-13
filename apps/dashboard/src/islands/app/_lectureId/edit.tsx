import { useSignal } from "@preact/signals";
import { Pencil, X } from "lucide-preact";
import { useRef } from "preact/hooks";

import { createClient } from "../../../client.ts";

type EditData = {
	lecture: {
		id: string;
		title: string | null;
		notes: string | null;
		subjectId: string | null;
		tags?: { id: string; name: string; color: string }[];
	};
	subjects: { id: string; name: string; color: string }[];
	tags: { id: string; name: string; color: string }[];
};

export default function LectureEdit({ data: dataJson }: { data: string }) {
	const { lecture, subjects, tags } = JSON.parse(dataJson) as EditData;

	const dialogRef = useRef<HTMLDialogElement>(null);
	const draft = useSignal({ title: "", notes: "", subjectId: "", tagIds: [] as string[] });
	const error = useSignal<string | null>(null);
	const saving = useSignal(false);

	function openDialog() {
		draft.value = {
			title: lecture.title ?? "",
			notes: lecture.notes ?? "",
			subjectId: lecture.subjectId ?? "",
			tagIds: (lecture.tags ?? []).map((tag) => tag.id),
		};
		error.value = null;
		dialogRef.current?.showModal();
	}

	function toggleTag(tagId: string) {
		const selected = new Set(draft.value.tagIds);
		if (selected.has(tagId)) selected.delete(tagId);
		else selected.add(tagId);
		draft.value = { ...draft.value, tagIds: [...selected] };
	}

	async function saveEdit(event: Event) {
		event.preventDefault();
		saving.value = true;
		error.value = null;

		try {
			const result = await createClient().patch("/lectures/:lectureId", {
				params: { lectureId: lecture.id },
				body: {
					id: lecture.id,
					title: draft.value.title.trim() || null,
					notes: draft.value.notes.trim() || null,
					subjectId: draft.value.subjectId || null,
					tagIds: draft.value.tagIds,
				},
			});

			if (!result.success) {
				error.value = "Enregistrement impossible.";
				return;
			}

			globalThis.location.reload();
		} catch {
			error.value = "Enregistrement impossible.";
		} finally {
			saving.value = false;
		}
	}

	return (
		<>
			<button type="button" class="btn" aria-label="Modifier" onClick={openDialog}>
				<Pencil size={16} aria-hidden="true" />
				<span>Modifier</span>
			</button>

			<dialog ref={dialogRef} class="lecture-edit-dialog">
				<form onSubmit={saveEdit}>
					<header>
						<h2>Modifier le cours</h2>
						<button
							type="button"
							class="btn btn-icon"
							aria-label="Fermer"
							onClick={() => dialogRef.current?.close()}
						>
							<X size={16} />
						</button>
					</header>

					<div class="dialog-body">
						<label class="field">
							<span>Titre</span>
							<input
								type="text"
								maxLength={300}
								value={draft.value.title}
								onInput={(event) =>
									draft.value = { ...draft.value, title: (event.target as HTMLInputElement).value }}
							/>
						</label>

						<label class="field">
							<span>Notes</span>
							<textarea
								rows={5}
								value={draft.value.notes}
								onInput={(event) =>
									draft.value = {
										...draft.value,
										notes: (event.target as HTMLTextAreaElement).value,
									}}
							/>
						</label>

						<label class="field">
							<span>Matière</span>
							<select
								value={draft.value.subjectId}
								onChange={(event) =>
									draft.value = {
										...draft.value,
										subjectId: (event.target as HTMLSelectElement).value,
									}}
							>
								<option value="">Non classé</option>
								{subjects.map((subject) => (
									<option key={subject.id} value={subject.id}>{subject.name}</option>
								))}
							</select>
						</label>

						<fieldset>
							<span>Étiquettes</span>
							<div class="tag-chips">
								{tags.length === 0 && <span class="tag-chips-empty">Aucune étiquette</span>}
								{tags.map((tag) => (
									<button
										type="button"
										key={tag.id}
										class="tag-chip"
										data-selected={draft.value.tagIds.includes(tag.id) ? "true" : undefined}
										onClick={() => toggleTag(tag.id)}
									>
										<span class="swatch" style={{ background: tag.color }}></span>
										{tag.name}
									</button>
								))}
							</div>
						</fieldset>

						{error.value && <p class="error">{error.value}</p>}
					</div>

					<footer>
						<button
							type="button"
							class="btn"
							disabled={saving.value}
							onClick={() => dialogRef.current?.close()}
						>
							Annuler
						</button>
						<button type="submit" class="btn btn-primary" disabled={saving.value}>
							{saving.value ? "Enregistrement..." : "Enregistrer"}
						</button>
					</footer>
				</form>
			</dialog>
		</>
	);
}
