import React, { useState } from "react";
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
import Chatbot from "./components/Chatbot.jsx";

// --- Root App with routing + auth state ---
function App() {
  // Initialize user from localStorage (done synchronously before first render)
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch (err) {
      console.error("Failed to parse stored user", err);
      return null;
    }
  });

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
          element={user ? <ErrorBoundary title="Booking Error"><MainApp /></ErrorBoundary> : <Navigate to="/login" replace />}
        />

        {/* My Tickets – PROTECTED */}
        <Route
          path="/tickets"
          element={user ? <ErrorBoundary title="My Tickets Error"><MyTickets /></ErrorBoundary> : <Navigate to="/login" replace />}
        />

        {/* Track Train – PROTECTED */}
        <Route
          path="/track"
          element={user ? <ErrorBoundary title="Track Train Error"><TrackTrain /></ErrorBoundary> : <Navigate to="/login" replace />}
        />

        {/* Admin Dashboard – PROTECTED */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <ErrorBoundary title="Dashboard Error">
                <AdminDashboard />
              </ErrorBoundary>
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
              <ErrorBoundary title="Login Error">
                <Login onLoginSuccess={handleLoginSuccess} />
              </ErrorBoundary>
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
            © 2025–2026 RailSmart — Intelligent Railway Ticketing
          </p>
        </footer>
      )}

      {/* Floating chatbot — visible on all authenticated pages */}
      {user && <Chatbot />}
    </>
  );
}

export default App;
