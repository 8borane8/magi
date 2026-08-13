import { Moon, Sun } from "lucide-preact";
import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { THEME_KEY } from "../components/theme-init.tsx";

function readDark(): boolean {
	const stored = localStorage.getItem(THEME_KEY);
	if (stored === "dark") return true;
	if (stored === "light") return false;
	return matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ThemeToggle() {
	const dark = useSignal(false);

	useEffect(() => {
		dark.value = readDark();
	}, []);

	function onToggle() {
		dark.value = !dark.value;
		const theme = dark.value ? "dark" : "light";
		localStorage.setItem(THEME_KEY, theme);
		document.documentElement.dataset.theme = theme;
	}

	return (
		<button
			type="button"
			class="btn btn-icon"
			aria-label={dark.value ? "Passer au thème clair" : "Passer au thème sombre"}
			onClick={onToggle}
		>
			{dark.value ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
		</button>
	);
}
