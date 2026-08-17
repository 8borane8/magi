import { useSignal } from "@preact/signals";
import { Slick } from "@webtools/slick-client";
import { ArrowLeft, Info, MessageCircle, Pencil, Trash2, X } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import { createClient } from "../../../client.ts";
import { homeHrefFromStorage } from "../../../utils/home-query.ts";
import { lectureTitle } from "../../../utils/lecture-format.ts";

type CatalogItem = { id: string; name: string; color: string };

function parseTagIds(value: string): string[] {
	try {
		return JSON.parse(value) as string[];
	} catch {
		return [];
	}
}

function applyLectureView(next: {
	title: string;
	createdAt: string | Date;
	notes: string;
	subject: CatalogItem | null;
	tags: CatalogItem[];
}) {
	const shown = lectureTitle({ title: next.title || null, createdAt: next.createdAt });
	document.title = `${shown} | Magi`;

	const heading = document.querySelector("#lecture > article > h1");
	if (heading) heading.textContent = shown;

	const article = document.querySelector("#lecture > article");
	if (article) {
		let notesEl = article.querySelector(":scope > p.lecture-notes");
		if (next.notes) {
			if (!notesEl) {
				notesEl = document.createElement("p");
				notesEl.className = "lecture-notes";
				article.querySelector(":scope > h1")?.after(notesEl);
			}
			notesEl.textContent = next.notes;
		} else {
			notesEl?.remove();
		}
	}

	const meta = document.getElementById("lecture-meta");
	const dl = meta?.querySelector(":scope > dl");
	if (!meta || !dl) return;

	const subjectRow = [...dl.querySelectorAll(":scope > div")].find((row) =>
		row.querySelector("dt")?.textContent === "Matière"
	);
	if (next.subject) {
		const row = subjectRow ?? dl.appendChild(document.createElement("div"));
		row.replaceChildren();
		const dt = document.createElement("dt");
		dt.textContent = "Matière";
		const dd = document.createElement("dd");
		dd.append(catalogPill(next.subject));
		row.append(dt, dd);
	} else {
		subjectRow?.remove();
	}

	const tagsHeading = [...meta.querySelectorAll(":scope > h2")].find((node) => node.textContent === "Étiquettes");
	const tagsList = tagsHeading?.nextElementSibling instanceof HTMLUListElement
		? tagsHeading.nextElementSibling
		: meta.querySelector(":scope > ul");
	if (next.tags.length === 0) {
		tagsHeading?.remove();
		tagsList?.remove();
		return;
	}

	const headingEl = tagsHeading ?? meta.appendChild(document.createElement("h2"));
	headingEl.textContent = "Étiquettes";
	const list = tagsList ?? meta.appendChild(document.createElement("ul"));
	if (!tagsHeading) headingEl.after(list);
	list.replaceChildren(
		...next.tags.map((tag) => {
			const item = document.createElement("li");
			const swatch = document.createElement("span");
			swatch.className = "swatch";
			swatch.style.background = tag.color;
			item.append(swatch, tag.name);
			return item;
		}),
	);
}

function catalogPill(item: CatalogItem): HTMLSpanElement {
	const pill = document.createElement("span");
	pill.className = "pill";
	const swatch = document.createElement("span");
	swatch.className = "swatch";
	swatch.style.background = item.color;
	pill.append(swatch, item.name);
	return pill;
}

export default function LectureNav({
	lectureId,
	title,
	createdAt,
	notes,
	subjectId,
	tagIds: tagIdsJson,
}: {
	lectureId: string;
	title: string;
	createdAt: string | Date;
	notes: string;
	subjectId: string;
	tagIds: string;
}) {
	const infoOpen = useSignal(false);
	const backHref = useSignal("/");
	const editRef = useRef<HTMLDialogElement>(null);
	const deleteRef = useRef<HTMLDialogElement>(null);

	const current = useSignal({
		title,
		notes,
		subjectId,
		tagIds: parseTagIds(tagIdsJson),
	});
	const draft = useSignal({ title: "", notes: "", subjectId: "", tagIds: [] as string[] });
	const subjects = useSignal<CatalogItem[]>([]);
	const tags = useSignal<CatalogItem[]>([]);
	const editError = useSignal<string | null>(null);
	const saving = useSignal(false);

	const deleteError = useSignal<string | null>(null);
	const deleting = useSignal(false);

	const shownTitle = lectureTitle({ title: current.value.title || null, createdAt });

	function syncInfo(next: boolean) {
		infoOpen.value = next;
		const root = document.getElementById("lecture");
		if (!root) return;
		if (next) root.setAttribute("data-info-open", "true");
		else root.removeAttribute("data-info-open");
	}

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") syncInfo(false);
		}

		const mq = matchMedia("(max-width: 1100px)");
		function onChange() {
			if (!mq.matches) syncInfo(false);
		}

		document.addEventListener("keydown", onKeyDown);
		mq.addEventListener("change", onChange);
		backHref.value = homeHrefFromStorage();
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			mq.removeEventListener("change", onChange);
		};
	}, []);

	async function openEdit() {
		draft.value = { ...current.value };
		editError.value = null;
		editRef.current?.showModal();

		try {
			const client = createClient();
			const [subjectsRes, tagsRes] = await Promise.all([
				client.get("/subjects"),
				client.get("/tags"),
			]);
			subjects.value = subjectsRes.items;
			tags.value = tagsRes.items;
		} catch {
			editError.value = "Impossible de charger les listes.";
		}
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
		editError.value = null;

		const next = {
			title: draft.value.title.trim(),
			notes: draft.value.notes.trim(),
			subjectId: draft.value.subjectId,
			tagIds: draft.value.tagIds,
		};

		try {
			const result = await createClient().patch("/lectures/:lectureId", {
				params: { lectureId },
				body: {
					title: next.title || null,
					notes: next.notes || null,
					subjectId: next.subjectId || null,
					tagIds: next.tagIds,
				},
			});

			if (!result.success) {
				editError.value = "Enregistrement impossible.";
				return;
			}

			current.value = next;
			applyLectureView({
				title: next.title,
				createdAt,
				notes: next.notes,
				subject: subjects.value.find((item) => item.id === next.subjectId) ?? null,
				tags: next.tagIds
					.map((id) => tags.value.find((item) => item.id === id))
					.filter((item): item is CatalogItem => Boolean(item)),
			});
			editRef.current?.close();
		} catch {
			editError.value = "Enregistrement impossible.";
		} finally {
			saving.value = false;
		}
	}

	async function confirmDelete() {
		deleting.value = true;
		deleteError.value = null;

		try {
			const result = await createClient().delete("/lectures/:lectureId", {
				params: { lectureId },
			});

			if (!result.success) {
				deleteError.value = "Suppression impossible.";
				return;
			}

			await Slick.redirect("/");
		} catch {
			deleteError.value = "Suppression impossible.";
		} finally {
			deleting.value = false;
		}
	}

	return (
		<div>
			<a href={backHref.value} aria-label="Retour">
				<ArrowLeft size={16} aria-hidden="true" />
				<span>Retour</span>
			</a>
			<div>
				<a class="btn btn-icon" href={`/l/${lectureId}/chat`} aria-label="Prof">
					<MessageCircle size={16} aria-hidden="true" />
				</a>
				<button
					type="button"
					class="btn btn-icon"
					aria-label="Informations"
					aria-expanded={infoOpen.value}
					aria-controls="lecture-meta"
					onClick={() => {
						const root = document.getElementById("lecture");
						syncInfo(!root?.hasAttribute("data-info-open"));
					}}
				>
					<Info size={16} aria-hidden="true" />
				</button>
				<button type="button" class="btn" aria-label="Modifier" onClick={() => void openEdit()}>
					<Pencil size={16} aria-hidden="true" />
					<span>Modifier</span>
				</button>
				<button
					type="button"
					class="btn btn-danger"
					aria-label="Supprimer"
					onClick={() => {
						deleteError.value = null;
						deleteRef.current?.showModal();
					}}
				>
					<Trash2 size={16} aria-hidden="true" />
					<span>Supprimer</span>
				</button>
			</div>

			<dialog ref={editRef} class="lecture-edit-dialog">
				<form onSubmit={saveEdit}>
					<header>
						<h2>Modifier le cours</h2>
						<button
							type="button"
							class="btn btn-icon"
							aria-label="Fermer"
							onClick={() => editRef.current?.close()}
						>
							<X size={16} />
						</button>
					</header>
					<div>
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
								{subjects.value.map((subject) => (
									<option key={subject.id} value={subject.id}>{subject.name}</option>
								))}
							</select>
						</label>
						<fieldset>
							<span>Étiquettes</span>
							<div class="tag-chips">
								{tags.value.length === 0 && <span class="tag-chips-empty">Aucune étiquette</span>}
								{tags.value.map((tag) => (
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
						{editError.value && <p class="error">{editError.value}</p>}
					</div>
					<footer>
						<button
							type="button"
							class="btn"
							disabled={saving.value}
							onClick={() => editRef.current?.close()}
						>
							Annuler
						</button>
						<button type="submit" class="btn btn-primary" disabled={saving.value}>
							{saving.value ? "Enregistrement..." : "Enregistrer"}
						</button>
					</footer>
				</form>
			</dialog>

			<dialog ref={deleteRef} class="lecture-edit-dialog">
				<header>
					<h2>Supprimer le cours</h2>
					<button
						type="button"
						class="btn btn-icon"
						aria-label="Fermer"
						onClick={() => deleteRef.current?.close()}
					>
						<X size={16} />
					</button>
				</header>
				<div>
					<p>Supprimer « {shownTitle} » ? Cette action est irréversible.</p>
					{deleteError.value && <p class="error">{deleteError.value}</p>}
				</div>
				<footer>
					<button
						type="button"
						class="btn"
						disabled={deleting.value}
						onClick={() => deleteRef.current?.close()}
					>
						Annuler
					</button>
					<button
						type="button"
						class="btn btn-danger"
						disabled={deleting.value}
						onClick={() => void confirmDelete()}
					>
						{deleting.value ? "Suppression..." : "Supprimer"}
					</button>
				</footer>
			</dialog>
		</div>
	);
}
