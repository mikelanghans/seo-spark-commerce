import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "./lib/errorLogger";

installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(<App />);
