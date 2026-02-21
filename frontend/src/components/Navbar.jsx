import React, { useState, useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "../context/ThemeContext";
import { Sun, Moon, Menu, X, LogOut, ChevronDown } from "lucide-react";

const ADMIN_EMAILS = ["harshsurve022@gmail.com"];
const NORMALIZED_ADMIN_EMAILS = ADMIN_EMAILS.map((email) => String(email).trim().toLowerCase());
const Motion = motion;

function AdminDropdown({ adminDropdownRef, isAdminRoute, adminOpen, setAdminOpen }) {
  return (
    <div className="nav-admin" ref={adminDropdownRef}>
      <button
        type="button"
        className={`nav-pill nav-admin-trigger ${isAdminRoute || adminOpen ? "active" : ""}`}
        onClick={() => setAdminOpen((prev) => !prev)}
        aria-expanded={adminOpen}
        aria-haspopup="menu"
        aria-label="Open admin navigation"
      >
        <span>Admin</span>
        <ChevronDown size={15} className={`nav-admin-chevron ${adminOpen ? "open" : ""}`} />
      </button>

      <AnimatePresence>
        {adminOpen && (
          <Motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="nav-admin-menu"
            role="menu"
          >
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => `nav-admin-item ${isActive ? "active" : ""}`}
              onClick={() => {
                setAdminOpen(false);
              }}
            >
              Overview
            </NavLink>
            <NavLink
              to="/admin/analytics"
              end
              className={({ isActive }) => `nav-admin-item ${isActive ? "active" : ""}`}
              onClick={() => {
                setAdminOpen(false);
              }}
            >
              Analytics
            </NavLink>
          </Motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Navbar({ user, onLogout }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const adminDropdownRef = useRef(null);

  const { theme, toggleTheme } = useTheme();

  // Check if current user is admin
  const userEmail = String(user?.email || "").trim().toLowerCase();
  const userRole = String(user?.role || "").trim().toLowerCase();
  const isAdmin = userRole === "admin" || NORMALIZED_ADMIN_EMAILS.includes(userEmail);
  const isAdminRoute = location.pathname === "/admin" || location.pathname.startsWith("/admin/");

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!adminDropdownRef.current) return;
      if (!adminDropdownRef.current.contains(event.target)) {
        setAdminOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!userEmail) {
      return;
    }

    let mounted = true;
    const controller = new AbortController();

    const loadNotificationCount = async () => {
      try {
        const [res, unreadRes] = await Promise.all([
          fetch(
          `http://localhost:5000/api/user/notifications-count?email=${encodeURIComponent(userEmail)}`,
          { signal: controller.signal }
          ),
          fetch(
            `http://localhost:5000/api/user/notifications/unread-count?email=${encodeURIComponent(userEmail)}`,
            { signal: controller.signal }
          ),
        ]);

        const data = await res.json().catch(() => ({}));
        const unreadData = await unreadRes.json().catch(() => ({}));
        if (!mounted) return;
        const baseCount = Number(data?.count || 0);
        const unreadCount = Number(unreadData?.unreadCount || 0);
        setNotificationCount(baseCount + unreadCount);
      } catch (err) {
        if (err?.name !== "AbortError" && mounted) {
          setNotificationCount(0);
        }
      }
    };

    loadNotificationCount();
    const interval = setInterval(loadNotificationCount, 30000);
    const refresh = () => loadNotificationCount();
    window.addEventListener("ticketBooked", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("ticketBooked", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userEmail]);

  const navPillClass = ({ isActive }) => `nav-pill ${isActive ? "active" : ""}`;

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
        onClick={() => setMobileOpen(true)}
        aria-label="Toggle navigation menu"
      >
        <Menu size={22} />
      </button>

      <div className="nav-links">
        {user && (
          <>
            <NavLink
              to="/dashboard"
              end
              className={navPillClass}
            >
              My Dashboard
            </NavLink>

            <NavLink
              to="/trains"
              end
              className={navPillClass}
            >
              Trains
            </NavLink>

            <div className="nav-item-wrap">
              <NavLink
                to="/tickets"
                end
                className={navPillClass}
              >
                My Tickets
              </NavLink>
              {notificationCount > 0 && (
                <span className="nav-badge" aria-label={`${notificationCount} notifications`}>
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </div>

            <NavLink
              to="/track"
              end
              className={navPillClass}
            >
              Track Train
            </NavLink>
            {isAdmin && (
              <AdminDropdown
                adminDropdownRef={adminDropdownRef}
                isAdminRoute={isAdminRoute}
                adminOpen={adminOpen}
                setAdminOpen={setAdminOpen}
              />
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

      <AnimatePresence>
        {mobileOpen && (
          <>
            <Motion.div
              className="nav-drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
            />

            <Motion.aside
              className="nav-drawer"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <div className="nav-drawer-head">
                <span>Menu</span>
                <button
                  type="button"
                  className="nav-drawer-close"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>

              {user && (
                <div className="nav-drawer-links">
                  <NavLink to="/dashboard" end className={navPillClass} onClick={() => setMobileOpen(false)}>
                    My Dashboard
                  </NavLink>
                  <NavLink to="/trains" end className={navPillClass} onClick={() => setMobileOpen(false)}>
                    Trains
                  </NavLink>
                  <div className="nav-item-wrap">
                    <NavLink to="/tickets" end className={navPillClass} onClick={() => setMobileOpen(false)}>
                      My Tickets
                    </NavLink>
                    {notificationCount > 0 && (
                      <span className="nav-badge" aria-label={`${notificationCount} notifications`}>
                        {notificationCount > 99 ? "99+" : notificationCount}
                      </span>
                    )}
                  </div>
                  <NavLink to="/track" end className={navPillClass} onClick={() => setMobileOpen(false)}>
                    Track Train
                  </NavLink>

                  {isAdmin && (
                    <>
                      <span className="nav-drawer-label">Admin</span>
                      <NavLink to="/admin" end className={navPillClass} onClick={() => setMobileOpen(false)}>
                        Overview
                      </NavLink>
                      <NavLink to="/admin/analytics" end className={navPillClass} onClick={() => setMobileOpen(false)}>
                        Analytics
                      </NavLink>
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

                  <button onClick={onLogout} className="logout-btn">
                    <LogOut size={14} style={{ marginRight: 4 }} /> Logout
                  </button>
                </div>
              )}
            </Motion.aside>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}

export default Navbar;
