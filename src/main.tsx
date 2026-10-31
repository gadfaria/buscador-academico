import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
