import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force rebuild v3 - env reload
createRoot(document.getElementById("root")!).render(<App />);
