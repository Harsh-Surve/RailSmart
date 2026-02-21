import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Chatbot from "../components/Chatbot.jsx";
import useAuth from "../auth/useAuth";

export default function UserLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <>
      <Navbar user={user} onLogout={logout} />

      {children ?? <Outlet />}

      <footer
        style={{
          marginTop: "3rem",
          padding: "1.5rem",
          textAlign: "center",
          color: "var(--rs-text-muted)",
          fontSize: "0.875rem",
          borderTop: "1px solid var(--rs-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "0.5rem",
          }}
        >
          <img
            src="/logo/logo.png"
            alt="RailSmart"
            style={{ height: "24px" }}
          />
        </div>
        <p style={{ margin: 0 }}>
          © 2025–2026 RailSmart — Intelligent Railway Ticketing
        </p>
      </footer>

      {user && <Chatbot />}
    </>
  );
}
