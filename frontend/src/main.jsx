import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./styles.css";          // legacy helpers — loaded after index.css so tokens resolve
import "./styles/dashboard.css";
import "leaflet/dist/leaflet.css";
import { ToastProvider } from "./components/ToastProvider";
import { ThemeProvider } from "./context/ThemeContext";

// Apply saved theme before first paint (avoids a light/dark flash on load)
try {
  const savedTheme = localStorage.getItem("theme");
  const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
  document.documentElement.setAttribute("data-theme", theme);
} catch {
  document.documentElement.setAttribute("data-theme", "dark");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
