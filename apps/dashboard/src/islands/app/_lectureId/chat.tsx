import { ArrowLeft, FileText, Maximize2, Paperclip, Send, Trash2, X } from "lucide-preact";
import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

import { type ChatFileKind, chatFileKind } from "@magi/shared/types/chat-file";

import ChatMessage, { type ChatMessageData } from "../../../components/chat-message.tsx";
import { type ChatLiveEvent, createClient, watchChatLive } from "../../../client.ts";
import { formatDuration } from "../../../utils/lecture-format.ts";

const MAX_FILES = 4;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FILE_HINT = "Fichiers : JPEG, PNG, WebP, GIF, PDF ou TXT, 5 Mo max, 4 maximum.";
const SEND_ERRORS: Record<string, string> = {
	context_exceeded:
		"Le contexte du modèle est trop petit pour ce cours. Augmente OLLAMA_CONTEXT_LENGTH ou raccourcis l'historique.",
	unsupported_file: FILE_HINT,
	pdf_unreadable: "Impossible de lire ce PDF.",
	busy: "Une réponse est déjà en cours.",
};

type DraftFile = {
	file: File;
	url: string;
	kind: ChatFileKind;
};

function filesFromDataTransfer(data: DataTransfer | null): File[] {
	if (!data) return [];
	if (data.files.length) return [...data.files];
	return [...data.items].map((item) => item.getAsFile()).filter((file): file is File => file !== null);
}

function revokeDraft(items: DraftFile[]) {
	for (const item of items) {
		if (item.url) URL.revokeObjectURL(item.url);
	}
}

export default function LectureChat({
	lectureId,
	nodeUrl,
	title,
	messages: initialMessages,
	fullPage = false,
}: {
	lectureId: string;
	nodeUrl: string;
	title?: string;
	messages?: ChatMessageData[];
	fullPage?: boolean;
}) {
	const messages = useSignal<ChatMessageData[]>(
		Array.isArray(initialMessages) ? initialMessages : [],
	);
	const draft = useSignal("");
	const files = useSignal<DraftFile[]>([]);
	const pending = useSignal(!Array.isArray(initialMessages));
	const sending = useSignal(false);
	const streamText = useSignal("");
	const sendStartedAt = useSignal(0);
	const tick = useSignal(0);
	const dropping = useSignal(false);
	const think = useSignal(false);
	const error = useSignal<string | null>(null);
	const listRef = useRef<HTMLOListElement>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const waitAbort = useRef<AbortController | null>(null);

	const srcPrefix = `${nodeUrl.replace(/\/+$/, "")}/lectures/${lectureId}/chat`;
	const count = messages.value.length;
	const canSend = Boolean(draft.value.trim() || files.value.length);
	const Tag = fullPage ? "section" : "aside";
	void tick.value;

	async function reloadMessages() {
		try {
			const result = await createClient().get("/lectures/:lectureId/chat", {
				params: { lectureId },
			});
			if (result.success && Array.isArray(result.data)) messages.value = result.data;
		} catch {
			error.value = "Impossible de charger la conversation.";
		}
	}

	async function waitReply(reloadOnIdle = false) {
		waitAbort.current?.abort();
		const ac = new AbortController();
		waitAbort.current = ac;
		let finished = false;
		let sawLive = false;

		try {
			await watchChatLive(lectureId, (event: ChatLiveEvent) => {
				sawLive = true;
				if (event.type === "init") {
					sending.value = true;
					streamText.value = event.text;
					sendStartedAt.value = event.startedAt;
					return;
				}
				if (event.type === "delta") {
					sending.value = true;
					streamText.value += event.text;
					return;
				}
				if (event.type === "done") {
					finished = true;
					const item = event.data as ChatMessageData;
					if (!messages.value.some((message) => message.id === item.id)) {
						messages.value = [...messages.value, item];
					}
					streamText.value = "";
					sending.value = false;
					return;
				}
				if (event.type === "error") {
					finished = true;
					streamText.value = "";
					sending.value = false;
					error.value = SEND_ERRORS[event.error] || "Envoi impossible.";
					void reloadMessages();
				}
			}, ac.signal);
		} finally {
			if (!ac.signal.aborted && !finished) {
				if (sawLive || reloadOnIdle) {
					streamText.value = "";
					sending.value = false;
				}
				if (reloadOnIdle) void reloadMessages();
			}
		}
	}

	useEffect(() => {
		let alive = true;

		try {
			think.value = localStorage.getItem("magi-chat-think") === "1";
		} catch {
			// Storage may be unavailable.
		}

		if (Array.isArray(initialMessages)) {
			pending.value = false;
		} else {
			void reloadMessages().finally(() => {
				if (alive) pending.value = false;
			});
		}

		void waitReply();

		return () => {
			alive = false;
			waitAbort.current?.abort();
			revokeDraft(files.value);
		};
	}, []);

	useEffect(() => {
		const list = listRef.current;
		if (list) list.scrollTop = list.scrollHeight;
	}, [count, sending.value, pending.value, streamText.value]);

	useEffect(() => {
		if (!sending.value) return;
		const timer = setInterval(() => tick.value++, 1000);
		return () => clearInterval(timer);
	}, [sending.value]);

	function addFiles(list: Iterable<File>) {
		const next = [...files.value];
		let rejected = false;

		for (const file of list) {
			if (next.length >= MAX_FILES) {
				rejected = true;
				break;
			}
			const kind = chatFileKind(file.type, file.name);
			if (!kind || file.size > MAX_FILE_BYTES) {
				rejected = true;
				continue;
			}
			next.push({
				file,
				kind,
				url: kind === "image" ? URL.createObjectURL(file) : "",
			});
		}

		files.value = next;
		error.value = rejected ? FILE_HINT : error.value;
	}

	function removeFile(index: number) {
		const next = [...files.value];
		const [removed] = next.splice(index, 1);
		if (removed?.url) URL.revokeObjectURL(removed.url);
		files.value = next;
	}

	function onPaste(event: ClipboardEvent) {
		const pasted = filesFromDataTransfer(event.clipboardData);
		if (pasted.length === 0) return;
		event.preventDefault();
		addFiles(pasted);
	}

	function onDragOver(event: DragEvent) {
		if (![...event.dataTransfer?.items || []].some((item) => item.kind === "file")) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
		dropping.value = true;
	}

	function onDragLeave(event: DragEvent) {
		const next = event.relatedTarget as Node | null;
		if (next && event.currentTarget instanceof Node && event.currentTarget.contains(next)) return;
		dropping.value = false;
	}

	function onDrop(event: DragEvent) {
		event.preventDefault();
		dropping.value = false;
		addFiles(filesFromDataTransfer(event.dataTransfer));
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		const content = draft.value.trim();
		const attached = files.value;
		if ((!content && attached.length === 0) || sending.value) return;

		sending.value = true;
		streamText.value = "";
		sendStartedAt.value = Date.now();
		error.value = null;
		draft.value = "";
		files.value = [];

		const restore = (message: string) => {
			error.value = message;
			draft.value = content;
			files.value = attached;
		};

		try {
			if (!nodeUrl) throw new Error("no_node");

			const body = new FormData();
			body.append("content", content);
			body.append("think", think.value ? "true" : "false");
			for (const item of attached) body.append("files", item.file);

			const response = await fetch(
				`${nodeUrl.replace(/\/+$/, "")}/lectures/${encodeURIComponent(lectureId)}/chat`,
				{
					method: "POST",
					body,
				},
			);
			const result = await response.json() as {
				success?: boolean;
				data?: ChatMessageData;
				error?: string;
			};

			if (!response.ok || !result.success || !result.data) {
				if (result.error === "busy") {
					restore(SEND_ERRORS.busy);
					sending.value = false;
					void waitReply(true);
					return;
				}
				restore((result.error && SEND_ERRORS[result.error]) || "Envoi impossible.");
				sending.value = false;
				return;
			}

			revokeDraft(attached);
			if (!messages.value.some((item) => item.id === result.data!.id)) {
				messages.value = [...messages.value, result.data];
			}
			void waitReply(true);
		} catch {
			restore("Envoi impossible.");
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
		<Tag
			id="lecture-chat"
			data-full={fullPage ? "" : undefined}
			data-drop={dropping.value ? "" : undefined}
			aria-busy={sending.value || pending.value}
			onPaste={onPaste}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<div>
				{fullPage
					? (
						<a href={`/l/${lectureId}`}>
							<ArrowLeft size={16} aria-hidden="true" />
							<span>Retour</span>
						</a>
					)
					: <p>Prof</p>}
				{fullPage && <span>{title}</span>}
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
			</div>

			{pending.value && <p>Chargement...</p>}
			{error.value && <p class="error">{error.value}</p>}

			{!pending.value && count === 0 && !sending.value && (
				<p>Posez une question sur ce cours. Vous pouvez coller ou déposer une image, un PDF ou un TXT.</p>
			)}

			{(count > 0 || sending.value) && (
				<ol ref={listRef}>
					{messages.value.map((message) => (
						<ChatMessage key={message.id} message={message} srcPrefix={srcPrefix} />
					))}
					{sending.value && (
						<li data-role="assistant" data-pending="">
							<p>{streamText.value || (think.value ? "Le prof réfléchit..." : "Le prof écrit...")}</p>
							<time>{formatDuration(Math.max(0, Date.now() - sendStartedAt.value))}</time>
						</li>
					)}
				</ol>
			)}

			<form onSubmit={onSubmit}>
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
				{files.value.length > 0 && (
					<ul>
						{files.value.map((item, index) => (
							<li key={`${item.file.name}-${index}`} data-kind={item.kind}>
								{item.kind === "image" ? <img src={item.url} alt={item.file.name} /> : (
									<>
										<FileText size={16} aria-hidden="true" />
										<span>{item.file.name}</span>
									</>
								)}
								<button
									type="button"
									class="btn btn-icon"
									disabled={sending.value}
									aria-label={`Retirer ${item.file.name}`}
									onClick={() => removeFile(index)}
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
							accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.pdf,.txt"
							multiple
							hidden
							disabled={sending.value}
							onChange={(event) => {
								addFiles(event.currentTarget.files || []);
								event.currentTarget.value = "";
							}}
						/>
						<button
							type="button"
							class="btn btn-icon"
							disabled={sending.value || files.value.length >= MAX_FILES}
							aria-label="Joindre un fichier"
							onClick={() => fileRef.current?.click()}
						>
							<Paperclip size={16} aria-hidden="true" />
						</button>
						<label>
							<input
								type="checkbox"
								checked={think.value}
								disabled={sending.value}
								onChange={(event) => {
									const on = (event.currentTarget as HTMLInputElement).checked;
									think.value = on;
									try {
										localStorage.setItem("magi-chat-think", on ? "1" : "0");
									} catch {
										// Storage may be unavailable.
									}
								}}
							/>
							Réflexion
						</label>
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
				<div>
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
		</Tag>
	);
}
