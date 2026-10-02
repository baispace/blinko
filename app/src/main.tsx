import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { silenceKnownDevNoise } from "./lib/devConsole";

silenceKnownDevNoise();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
