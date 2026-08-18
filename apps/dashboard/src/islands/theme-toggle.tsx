import { Moon, Sun } from "lucide-preact";

import { THEME_KEY } from "../components/theme-init.tsx";

export default function ThemeToggle() {
	function onToggle() {
		const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
		localStorage.setItem(THEME_KEY, next);
		document.documentElement.dataset.theme = next;
	}

	return (
		<button
			type="button"
			class="btn btn-icon theme-toggle"
			aria-label="Changer le thème"
			onClick={onToggle}
		>
			<Sun class="icon-sun" size={16} aria-hidden="true" />
			<Moon class="icon-moon" size={16} aria-hidden="true" />
		</button>
	);
}
