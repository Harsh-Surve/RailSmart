import React, { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { Sun, Moon, Menu, X, LogOut } from "lucide-react";

const ADMIN_EMAILS = ["harshsurve022@gmail.com"];

function Navbar({ user, onLogout }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const { theme, toggleTheme } = useTheme();

  const isActive = (path) => location.pathname === path;

  // Auto-close menu on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Check if current user is admin
  const userEmail = user?.email ? user.email.toLowerCase() : "";
  const isAdmin = ADMIN_EMAILS.includes(userEmail);

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="brand">
          <img
            src="/logo/logo.png"
            alt="RailSmart"
            className="navbar-logo"
          />
          <span>RailSmart</span>
        </Link>
      </div>

      {/* Hamburger — only visible on mobile */}
      <button
        className="hamburger"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation menu"
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Nav links — slide-down on mobile */}
      <div className={`nav-links ${open ? "open" : ""}`}>
        {user && (
          <>
            <Link
              to="/trains"
              className={`nav-pill ${isActive("/trains") ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              Trains & Booking
            </Link>
            <Link
              to="/tickets"
              className={`nav-pill ${isActive("/tickets") ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              My Tickets
            </Link>
            <Link
              to="/track"
              className={`nav-pill ${isActive("/track") ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              Track Train
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className={`nav-pill ${isActive("/admin") ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                Dashboard
              </Link>
            )}
          </>
        )}

        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <span className="theme-toggle-track">
            <span className={`theme-toggle-thumb ${theme === "dark" ? "theme-toggle-thumb--dark" : "theme-toggle-thumb--light"}`}>
              {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
            </span>
            <Sun size={11} className="theme-toggle-icon theme-toggle-icon--sun" />
            <Moon size={11} className="theme-toggle-icon theme-toggle-icon--moon" />
          </span>
        </button>

        <span className="nav-user">
          {user ? user.name || user.email : "Not logged in"}
        </span>

        {user && (
          <button onClick={onLogout} className="logout-btn">
            <LogOut size={14} style={{ marginRight: 4 }} /> Logout
          </button>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
