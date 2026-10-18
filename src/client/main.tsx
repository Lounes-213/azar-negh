import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
// Self-hosted brand typography (no external font CDN): Poppins for Latin text,
// Cairo for the Arabic/RTL locale. Bundled by Vite from @fontsource.
// Latin subset only (it carries the French accents) — importing the default
// `poppins/*.css` would also bundle the unused Devanagari subsets. Arabic text
// falls through to Cairo below.
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-800.css";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-500.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/arabic-700.css";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/shell.css";
import { I18nProvider } from "./lib/i18n";
import { AuthProvider } from "./lib/auth";
import { RealtimeProvider } from "./lib/realtime";
import { ToastProvider } from "./components/ui";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <RealtimeProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </RealtimeProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
