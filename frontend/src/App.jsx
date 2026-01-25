import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar.jsx";
import MainApp from "./pages/MainApp.jsx";
import Login from "./pages/Login.jsx";
import MyTickets from "./pages/MyTickets.jsx";
import Register from "./pages/Register.jsx";
import TrackTrain from "./pages/TrackTrain.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// --- Root App with routing + auth state ---
function App() {
  const [user, setUser] = useState(null);

  // Load user from localStorage on first render
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (err) {
        console.error("Failed to parse stored user", err);
      }
    }
  }, []);

  const handleLoginSuccess = (googleUser) => {
    setUser(googleUser);
    localStorage.setItem("user", JSON.stringify(googleUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

  return (
    <BrowserRouter>
      <AppContent
        user={user}
        handleLoginSuccess={handleLoginSuccess}
        handleLogout={handleLogout}
      />
    </BrowserRouter>
  );
}

function AppContent({ user, handleLoginSuccess, handleLogout }) {
  const location = useLocation();
  const hideFooter = location.pathname === "/login" || location.pathname === "/register";
  const hideNavbar = location.pathname === "/login" || location.pathname === "/register";

  return (
    <>
      {/* Top navbar - hidden on auth pages */}
      {!hideNavbar && <Navbar user={user} onLogout={handleLogout} />}

      <ErrorBoundary title="RailSmart UI Error">
        <Routes>
        {/* Root: always send to trains */}
        <Route path="/" element={<Navigate to="/trains" replace />} />

        {/* Trains page – PROTECTED */}
        <Route
          path="/trains"
          element={user ? <MainApp /> : <Navigate to="/login" replace />}
        />

        {/* My Tickets – PROTECTED */}
        <Route
          path="/tickets"
          element={user ? <MyTickets /> : <Navigate to="/login" replace />}
        />

        {/* Track Train – PROTECTED */}
        <Route
          path="/track"
          element={user ? <TrackTrain /> : <Navigate to="/login" replace />}
        />

        {/* Admin Dashboard – PROTECTED */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />

        {/* Register – usually public (optional) */}
        <Route path="/register" element={<Register />} />

        {/* Login – redirect to / if already logged in */}
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <Login onLoginSuccess={handleLoginSuccess} />
            )
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/trains" replace />} />
        </Routes>
      </ErrorBoundary>

      {/* Footer - hidden on login/register pages */}
      {!hideFooter && (
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
            © 2025 RailSmart — Intelligent Railway Ticketing
          </p>
        </footer>
      )}
    </>
  );
}

export default App;
