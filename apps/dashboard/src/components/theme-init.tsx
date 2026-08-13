export const THEME_KEY = "magi.theme";

const themeInitScript =
	`try{var t=localStorage.getItem("${THEME_KEY}"),s=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t==="dark"||t==="light"?t:s}catch(e){document.documentElement.dataset.theme=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}`;

export default function ThemeInit() {
	return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}
