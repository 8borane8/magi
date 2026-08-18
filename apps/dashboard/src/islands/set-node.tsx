import { useSignal } from "@preact/signals";
import { Cookies, Slick } from "@webtools/slick-client";
import { useEffect } from "preact/hooks";

import { createClient } from "../client.ts";

export default function SetNode() {
	const url = useSignal("http://localhost:5050");
	const error = useSignal<string | null>(null);
	const pending = useSignal(false);

	useEffect(() => {
		const existing = Cookies.get("nodeUrl");
		if (existing) url.value = existing;
	}, []);

	async function onSubmit(event: Event) {
		event.preventDefault();
		error.value = null;
		pending.value = true;

		const trimmed = url.value.trim();
		let origin: string;
		try {
			origin = new URL(trimmed).origin;
		} catch {
			pending.value = false;
			error.value = "L'URL est invalide.";
			return;
		}

		try {
			await createClient(origin).get("/health");
		} catch {
			pending.value = false;
			error.value = "Impossible de joindre le noeud.";
			return;
		}

		pending.value = false;

		Cookies.set("nodeUrl", origin);
		await Slick.redirect("/");
	}

	return (
		<article>
			<h1>Connecter le noeud</h1>
			<p>Indiquez l'URL de votre noeud Magi. Le tableau de bord l'enregistre dans un cookie.</p>
			<form onSubmit={onSubmit}>
				<label class="field">
					<span>URL du noeud</span>
					<input
						type="url"
						required
						spellcheck={false}
						autocomplete="url"
						inputMode="url"
						placeholder="http://localhost:5050"
						value={url}
						onInput={(event) => url.value = (event.target as HTMLInputElement).value}
					/>
				</label>
				{error.value && <p class="error">{error.value}</p>}
				<button type="submit" class="btn btn-primary" disabled={pending.value}>
					{pending.value ? "Test en cours..." : "Tester et enregistrer"}
				</button>
			</form>
		</article>
	);
}
