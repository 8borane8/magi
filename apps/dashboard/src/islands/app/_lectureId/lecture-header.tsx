import { useSignal } from "@preact/signals";
import { Slick } from "@webtools/slick-client";
import { ArrowLeft, Info, MessageCircle, Pencil, Trash2, X } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import { SessionStatus } from "@magi/shared/types/session";
import MarkdownContent from "../../../components/markdown-content.tsx";
import { createClient } from "../../../client.ts";
import { homeHrefFromStorage } from "../../../utils/home-query.ts";
import { formatBytes, formatDate, formatDuration, lectureTitle, STATUS_LABEL } from "../../../utils/lecture-format.ts";

type CatalogItem = { id: string; name: string; color: string };

function asItems(value: CatalogItem[] | string | undefined): CatalogItem[] {
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as CatalogItem[];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	return [];
}

function asItem(value: CatalogItem | string | null | undefined): CatalogItem | null {
	if (!value) return null;
	if (typeof value === "string") {
		try {
			return JSON.parse(value) as CatalogItem;
		} catch {
			return null;
		}
	}
	return value;
}

export default function LectureHeader({
	lectureId,
	title,
	createdAt,
	notes,
	status,
	audioMs,
	audioBytes,
	subject: subjectProp,
	tags: tagsProp,
	resume,
	resumeFailed,
}: {
	lectureId: string;
	title: string;
	createdAt: string;
	notes: string;
	status: SessionStatus;
	audioMs: number;
	audioBytes: number;
	subject: CatalogItem | null;
	tags: CatalogItem[];
	resume: string;
	resumeFailed: boolean | string;
}) {
	const infoOpen = useSignal(false);
	const backHref = useSignal("/");
	const editRef = useRef<HTMLDialogElement>(null);
	const deleteRef = useRef<HTMLDialogElement>(null);

	const current = useSignal({
		title,
		notes,
		subject: asItem(subjectProp),
		tags: asItems(tagsProp),
	});
	const draft = useSignal({ title: "", notes: "", subjectId: "", tagIds: [] as string[] });
	const subjects = useSignal<CatalogItem[]>([]);
	const tags = useSignal<CatalogItem[]>([]);
	const editError = useSignal<string | null>(null);
	const saving = useSignal(false);
	const deleteError = useSignal<string | null>(null);
	const deleting = useSignal(false);

	const shownTitle = lectureTitle({ title: current.value.title || null, createdAt });
	const failed = resumeFailed === true || resumeFailed === "true";

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
		draft.value = {
			title: current.value.title,
			notes: current.value.notes,
			subjectId: current.value.subject?.id || "",
			tagIds: current.value.tags.map((tag) => tag.id),
		};
		editError.value = null;
		editRef.current?.showModal();

		try {
			const client = createClient();
			const [subjectsRes, tagsRes] = await Promise.all([
				client.get("/subjects"),
				client.get("/tags"),
			]);
			if (!subjectsRes.success || !tagsRes.success) throw new Error("load");
			subjects.value = subjectsRes.data;
			tags.value = tagsRes.data;
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

			current.value = {
				title: next.title,
				notes: next.notes,
				subject: subjects.value.find((item) => item.id === next.subjectId) || null,
				tags: next.tagIds
					.map((id) => tags.value.find((item) => item.id === id))
					.filter((item): item is CatalogItem => Boolean(item)),
			};
			document.title = `${lectureTitle({ title: next.title || null, createdAt })} | Magi`;
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
		<div class="lecture-head">
			<div id="lecture-toolbar">
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
										draft.value = {
											...draft.value,
											title: (event.target as HTMLInputElement).value,
										}}
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

			<aside id="lecture-meta">
				<dl>
					<div>
						<dt>Statut</dt>
						<dd>
							<span class="pill" data-status={status}>
								{STATUS_LABEL[status] || status}
							</span>
						</dd>
					</div>
					<div>
						<dt>Date</dt>
						<dd>{formatDate(createdAt)}</dd>
					</div>
					<div>
						<dt>Durée</dt>
						<dd>{formatDuration(audioMs)}</dd>
					</div>
					<div>
						<dt>Audio</dt>
						<dd>{formatBytes(audioBytes)}</dd>
					</div>
					{current.value.subject && (
						<div>
							<dt>Matière</dt>
							<dd>
								<span class="pill">
									<span class="swatch" style={{ background: current.value.subject.color }}></span>
									{current.value.subject.name}
								</span>
							</dd>
						</div>
					)}
				</dl>

				{current.value.tags.length > 0 && (
					<>
						<h2>Étiquettes</h2>
						<ul>
							{current.value.tags.map((tag) => (
								<li key={tag.id}>
									<span class="swatch" style={{ background: tag.color }}></span>
									{tag.name}
								</li>
							))}
						</ul>
					</>
				)}
			</aside>

			<article id="lecture-fiche">
				<h1>{shownTitle}</h1>
				{current.value.notes && <p class="lecture-notes">{current.value.notes}</p>}
				{failed
					? <p>Impossible de charger la fiche.</p>
					: resume
					? <MarkdownContent source={resume} />
					: <p>Pas de fiche pour ce cours.</p>}
			</article>
		</div>
	);
}
