import { ArrowLeft, ImagePlus, Maximize2, Send, Trash2, X } from "lucide-preact";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

import ChatMessage, { type ChatMessageData } from "../../../components/chat-message.tsx";
import { createClient } from "../../../client.ts";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type DraftImage = {
	file: File;
	url: string;
};

export default function LectureChat({
	lectureId,
	nodeUrl,
	title,
	fullPage = false,
}: {
	lectureId: string;
	nodeUrl: string;
	title?: string;
	fullPage?: boolean;
}) {
	const messages = useSignal<ChatMessageData[]>([]);
	const draft = useSignal("");
	const images = useSignal<DraftImage[]>([]);
	const pending = useSignal(true);
	const sending = useSignal(false);
	const error = useSignal<string | null>(null);
	const listRef = useRef<HTMLOListElement>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	const srcPrefix = `${nodeUrl.replace(/\/+$/, "")}/lectures/${lectureId}/chat`;
	const count = messages.value.length;
	const canSend = Boolean(draft.value.trim() || images.value.length);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const result = await createClient().get("/lectures/:lectureId/chat", {
					params: { lectureId },
				});
				if (!result.success || !Array.isArray(result.data)) throw new Error("chat_load_failed");
				if (!cancelled) messages.value = result.data;
			} catch {
				if (!cancelled) error.value = "Impossible de charger la conversation.";
			} finally {
				if (!cancelled) pending.value = false;
			}
		})();

		return () => {
			cancelled = true;
			for (const item of images.value) URL.revokeObjectURL(item.url);
		};
	}, []);

	useEffect(() => {
		const list = listRef.current;
		if (list) list.scrollTop = list.scrollHeight;
	}, [count, sending.value, pending.value]);

	function addFiles(list: FileList | null) {
		if (!list) return;

		const next = [...images.value];
		let rejected = false;

		for (const file of list) {
			if (next.length >= MAX_IMAGES) {
				rejected = true;
				break;
			}
			if (!IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES) {
				rejected = true;
				continue;
			}
			next.push({ file, url: URL.createObjectURL(file) });
		}

		images.value = next;
		error.value = rejected ? "Images : JPEG, PNG, WebP ou GIF, 5 Mo max, 4 maximum." : error.value;
	}

	function removeImage(index: number) {
		const next = [...images.value];
		const [removed] = next.splice(index, 1);
		if (removed) URL.revokeObjectURL(removed.url);
		images.value = next;
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		const content = draft.value.trim();
		const attached = images.value;
		if ((!content && attached.length === 0) || sending.value) return;

		sending.value = true;
		error.value = null;

		try {
			if (!nodeUrl) throw new Error("no_node");

			const body = new FormData();
			body.append("content", content);
			for (const item of attached) body.append("images", item.file);

			const response = await fetch(`${nodeUrl}/lectures/${encodeURIComponent(lectureId)}/chat`, {
				method: "POST",
				body,
			});
			const result = await response.json() as { success?: boolean; data?: ChatMessageData[] };
			if (!result.success || !Array.isArray(result.data)) throw new Error("chat_send_failed");

			for (const item of attached) URL.revokeObjectURL(item.url);
			draft.value = "";
			images.value = [];
			messages.value = [...messages.value, ...result.data];
		} catch {
			error.value = "Envoi impossible.";
		} finally {
			sending.value = false;
		}
	}

	async function confirmClear() {
		if (sending.value) return;

		sending.value = true;
		error.value = null;

		try {
			const result = await createClient().delete("/lectures/:lectureId/chat", {
				params: { lectureId },
			});
			if (!result.success) throw new Error("chat_clear_failed");
			messages.value = [];
			dialogRef.current?.close();
		} catch {
			error.value = "Impossible d'effacer la conversation.";
		} finally {
			sending.value = false;
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key !== "Enter" || event.shiftKey) return;
		event.preventDefault();
		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}

	return (
		<aside id="lecture-chat" data-full={fullPage ? "" : undefined} aria-busy={sending.value || pending.value}>
			<h2 class="chat-head">
				{fullPage
					? (
						<a class="chat-back" href={`/l/${lectureId}`}>
							<ArrowLeft size={16} aria-hidden="true" />
							<span>Retour</span>
						</a>
					)
					: (
						"Prof"
					)}
				{fullPage && <span class="chat-title">{title}</span>}
				<menu>
					{!fullPage && (
						<li>
							<a
								class="btn btn-icon"
								href={`/l/${lectureId}/chat`}
								aria-label="Ouvrir en page entière"
							>
								<Maximize2 size={16} aria-hidden="true" />
							</a>
						</li>
					)}
					<li>
						<button
							type="button"
							class="btn btn-icon"
							aria-label="Effacer la conversation"
							disabled={sending.value || count === 0}
							onClick={() => {
								error.value = null;
								dialogRef.current?.showModal();
							}}
						>
							<Trash2 size={16} aria-hidden="true" />
						</button>
					</li>
				</menu>
			</h2>

			{pending.value && <p>Chargement...</p>}
			{error.value && <p class="error">{error.value}</p>}

			{!pending.value && count === 0 && !sending.value && (
				<p>Pose une question sur ce cours. Le prof s'appuiera sur la fiche.</p>
			)}

			{(count > 0 || sending.value) && (
				<ol class="chat-thread" ref={listRef}>
					{messages.value.map((message) => (
						<ChatMessage key={message.id} message={message} srcPrefix={srcPrefix} />
					))}
					{sending.value && (
						<li data-pending="">
							<p>Le prof écrit...</p>
						</li>
					)}
				</ol>
			)}

			<form class="chat-composer" onSubmit={onSubmit}>
				<textarea
					name="content"
					rows={3}
					maxLength={4000}
					placeholder="Écrire au prof..."
					disabled={sending.value}
					value={draft.value}
					onInput={(event) => {
						draft.value = (event.currentTarget as HTMLTextAreaElement).value;
					}}
					onKeyDown={onKeyDown}
				/>
				{images.value.length > 0 && (
					<ul class="chat-drafts">
						{images.value.map((item, index) => (
							<li key={item.url}>
								<img src={item.url} alt={item.file.name} />
								<button
									type="button"
									class="btn btn-icon"
									disabled={sending.value}
									aria-label={`Retirer ${item.file.name}`}
									onClick={() => removeImage(index)}
								>
									<X size={12} aria-hidden="true" />
								</button>
							</li>
						))}
					</ul>
				)}
				<menu>
					<li>
						<input
							ref={fileRef}
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							multiple
							hidden
							disabled={sending.value}
							onChange={(event) => {
								addFiles(event.currentTarget.files);
								event.currentTarget.value = "";
							}}
						/>
						<button
							type="button"
							class="btn btn-icon"
							disabled={sending.value || images.value.length >= MAX_IMAGES}
							aria-label="Joindre une image"
							onClick={() => fileRef.current?.click()}
						>
							<ImagePlus size={16} aria-hidden="true" />
						</button>
					</li>
					<li>
						<button
							type="submit"
							class="btn btn-primary"
							disabled={sending.value || !canSend}
							aria-label="Envoyer"
						>
							<Send size={16} aria-hidden="true" />
							<span>{sending.value ? "Envoi..." : "Envoyer"}</span>
						</button>
					</li>
				</menu>
			</form>

			<dialog ref={dialogRef} class="lecture-edit-dialog">
				<header>
					<h2>Effacer la conversation</h2>
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
					<p>Effacer tout l'historique de ce cours ? Cette action est irréversible.</p>
				</div>
				<footer>
					<button
						type="button"
						class="btn"
						disabled={sending.value}
						onClick={() => dialogRef.current?.close()}
					>
						Annuler
					</button>
					<button
						type="button"
						class="btn btn-danger"
						disabled={sending.value}
						onClick={() => void confirmClear()}
					>
						{sending.value ? "Suppression..." : "Effacer"}
					</button>
				</footer>
			</dialog>
		</aside>
	);
}
