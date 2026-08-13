import { Slick } from "@webtools/slick-client";

function syncNav() {
	const path = globalThis.location.pathname;
	for (const link of document.querySelectorAll("header > nav > a")) {
		if (link.getAttribute("href") === path) link.setAttribute("aria-current", "page");
		else link.removeAttribute("aria-current");
	}
}

syncNav();
globalThis.addEventListener("popstate", syncNav);
Slick.addOnloadListener(syncNav);
