import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./core"; // registers traffic providers
import "./styles/global.css";
import App from "./App";
import { registerAlarmServiceWorker } from "./core/notifications";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void registerAlarmServiceWorker();
