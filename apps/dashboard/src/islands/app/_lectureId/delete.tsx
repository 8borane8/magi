import { useSignal } from "@preact/signals";
import { Trash2, X } from "lucide-preact";
import { useRef } from "preact/hooks";

import { createClient } from "../../../client.ts";

export default function LectureDelete({ lectureId, title }: { lectureId: string; title: string }) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const error = useSignal<string | null>(null);
	const pending = useSignal(false);

	function openDialog() {
		error.value = null;
		dialogRef.current?.showModal();
	}

	async function confirmDelete() {
		pending.value = true;
		error.value = null;

		try {
			const result = await createClient().delete("/lectures/:lectureId", {
				params: { lectureId },
			});

			if (!result.success) {
				error.value = "Suppression impossible.";
				return;
			}

			globalThis.location.assign("/");
		} catch {
			error.value = "Suppression impossible.";
		} finally {
			pending.value = false;
		}
	}

	return (
		<>
			<button type="button" class="btn btn-danger" aria-label="Supprimer" onClick={openDialog}>
				<Trash2 size={16} aria-hidden="true" />
				<span>Supprimer</span>
			</button>

			<dialog ref={dialogRef} class="lecture-edit-dialog">
				<header>
					<h2>Supprimer le cours</h2>
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
					<p>Supprimer « {title} » ? Cette action est irréversible.</p>
					{error.value && <p class="error">{error.value}</p>}
				</div>

				<footer>
					<button
						type="button"
						class="btn"
						disabled={pending.value}
						onClick={() => dialogRef.current?.close()}
					>
						Annuler
					</button>
					<button type="button" class="btn btn-danger" disabled={pending.value} onClick={confirmDelete}>
						{pending.value ? "Suppression..." : "Supprimer"}
					</button>
				</footer>
			</dialog>
		</>
	);
}
