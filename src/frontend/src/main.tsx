import "@xyflow/react/dist/style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

/**
 * Application entry point.
 *
 * Mounts the React 18 app into the `#root` DOM element. The root element is
 * guaranteed to exist because it is defined in `index.html`; an explicit error
 * is thrown if it is missing so failures surface immediately rather than
 * producing a blank page.
 *
 * Tailwind CSS v4 is activated by the `app.css` import, which includes the
 * `@import "tailwindcss"` directive processed by the `@tailwindcss/vite` plugin.
 */
const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
