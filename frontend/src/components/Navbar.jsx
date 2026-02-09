import React, { useMemo, useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import "./Navbar.css";

const ADMIN_EMAILS = ["harshsurve022@gmail.com"];

function Navbar({ user, onLogout }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const toggleThemeLabel = useMemo(
    () => (theme === "dark" ? "☀️ Light" : "🌙 Dark"),
    [theme]
  );

  const isActive = (path) => location.pathname === path;

  // Check if current user is admin
  const userEmail = user?.email ? user.email.toLowerCase() : "";
  const isAdmin = ADMIN_EMAILS.includes(userEmail);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const navLinks = [
    { to: "/trains", label: "🚆 Trains & Booking" },
    { to: "/tickets", label: "🎫 My Tickets" },
    { to: "/track", label: "📍 Track Train" },
    ...(isAdmin ? [{ to: "/admin", label: "📊 Dashboard" }] : []),
  ];

  return (
    <header className="rs-navbar" ref={menuRef}>
      {/* Left: logo */}
      <Link to="/" className="rs-navbar-brand">
        <img src="/logo/logo.png" alt="RailSmart" className="rs-navbar-logo" />
        <span className="rs-navbar-title">RailSmart</span>
      </Link>

      {/* Hamburger button - only visible on mobile */}
      <button
        className="rs-navbar-hamburger"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Toggle navigation"
      >
        <span className={`rs-hamburger-line ${menuOpen ? "open" : ""}`} />
        <span className={`rs-hamburger-line ${menuOpen ? "open" : ""}`} />
        <span className={`rs-hamburger-line ${menuOpen ? "open" : ""}`} />
      </button>

      {/* Right: nav + user  (toggles on mobile) */}
      <nav className={`rs-navbar-nav ${menuOpen ? "rs-navbar-nav--open" : ""}`}>
        {user && navLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`rs-nav-pill ${isActive(link.to) ? "rs-nav-pill--active" : ""}`}
          >
            {link.label}
          </Link>
        ))}

        <button
          type="button"
          className="rs-theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          {toggleThemeLabel}
        </button>

        <span className="rs-navbar-user">
          {user ? user.name || user.email : "Not logged in"}
        </span>

        {user && (
          <button onClick={onLogout} className="rs-navbar-logout">
            Logout
          </button>
        )}
      </nav>
    </header>
  );
}

export default Navbar;
