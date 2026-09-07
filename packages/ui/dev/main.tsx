import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "../src/styles/tailwind.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element in dev/index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
