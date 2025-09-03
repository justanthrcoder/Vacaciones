// inyecta env vars (VITE_*) en window para compatibilidad con el componente
const _cfg = import.meta.env.VITE_FIREBASE_CONFIG ?? "";
try {
  window.__firebase_config = _cfg ? JSON.stringify(JSON.parse(_cfg)) : "{}";
} catch (e) {
  window.__firebase_config = "{}";
}
window.__app_id = import.meta.env.VITE_APP_ID ?? "dev";
window.__initial_auth_token = import.meta.env.VITE_INITIAL_AUTH_TOKEN ?? undefined;

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
