import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const ADMIN_EMAILS = ["harshsurve022@gmail.com"];

function Navbar({ user, onLogout }) {
  const location = useLocation();

  const { theme, toggleTheme } = useTheme();

  const toggleThemeLabel = useMemo(
    () => (theme === "dark" ? "Light" : "Dark"),
    [theme]
  );

  const isActive = (path) => location.pathname === path;

  // Check if current user is admin
  const userEmail = user?.email ? user.email.toLowerCase() : "";
  const isAdmin = ADMIN_EMAILS.includes(userEmail);

  return (
    <header
      style={{
        backgroundColor: "var(--rs-nav-bg)",
        color: "var(--rs-nav-fg)",
        padding: "0.75rem 2rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {/* Left: logo / brand */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Link
          to="/"
          style={{
            color: "var(--rs-nav-fg)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <img
            src="/logo/logo.png"
            alt="RailSmart"
            style={{ height: "24px", width: "auto" }}
          />
          <span style={{ fontWeight: 600, fontSize: "1.125rem", letterSpacing: "-0.025em" }}>
            RailSmart
          </span>
        </Link>
      </div>

      {/* Right: nav + user */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {user && (
          <>
            <Link
              to="/trains"
              style={{
                padding: "0.35rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid var(--rs-nav-pill-border)",
                textDecoration: "none",
                fontSize: "0.9rem",
                backgroundColor: isActive("/trains") ? "var(--rs-nav-pill-bg-active)" : "transparent",
                color: isActive("/trains") ? "var(--rs-nav-pill-fg-active)" : "var(--rs-nav-fg)",
              }}
            >
              Trains & Booking
            </Link>

            <Link
              to="/tickets"
              style={{
                padding: "0.35rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid var(--rs-nav-pill-border)",
                textDecoration: "none",
                fontSize: "0.9rem",
                backgroundColor: isActive("/tickets") ? "var(--rs-nav-pill-bg-active)" : "transparent",
                color: isActive("/tickets") ? "var(--rs-nav-pill-fg-active)" : "var(--rs-nav-fg)",
              }}
            >
              My Tickets
            </Link>

            <Link
              to="/track"
              style={{
                padding: "0.35rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid var(--rs-nav-pill-border)",
                textDecoration: "none",
                fontSize: "0.9rem",
                backgroundColor: isActive("/track") ? "var(--rs-nav-pill-bg-active)" : "transparent",
                color: isActive("/track") ? "var(--rs-nav-pill-fg-active)" : "var(--rs-nav-fg)",
              }}
            >
              Track Train
            </Link>

            {/* Show dashboard link only for admin users */}
            {isAdmin && (
              <Link
                to="/admin"
                style={{
                  padding: "0.35rem 0.9rem",
                  borderRadius: "999px",
                  border: "1px solid var(--rs-nav-pill-border)",
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  backgroundColor: isActive("/admin") ? "var(--rs-nav-pill-bg-active)" : "transparent",
                  color: isActive("/admin") ? "var(--rs-nav-pill-fg-active)" : "var(--rs-nav-fg)",
                }}
              >
                User Dashboard
              </Link>
            )}
          </>
        )}

        <button
          type="button"
          className="rs-theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {toggleThemeLabel}
        </button>

        <span style={{ fontSize: "0.9rem", marginLeft: "0.75rem" }}>
          {user ? user.name || user.email : "Not logged in"}
        </span>

        {user && (
          <button
            onClick={onLogout}
            style={{
              marginLeft: "0.5rem",
              padding: "0.35rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              backgroundColor: "#f44336",
              color: "white",
            }}
          >
            Logout
          </button>
        )}
      </div>
    </header>
  );
}

export default Navbar;
