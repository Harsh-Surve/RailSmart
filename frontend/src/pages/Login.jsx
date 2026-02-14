import React, { useState, useEffect, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Train } from "lucide-react";

// Lazy-load Google button so it NEVER affects initial render
const LazyGoogleButton = React.lazy(
  () => import("../components/GoogleLoginButton.jsx")
);

function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [showGoogle, setShowGoogle] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Delay Google SDK load
  useEffect(() => {
    const t = setTimeout(() => setShowGoogle(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password.");
      return;
    }
    try {
      const res = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid email or password.");
        return;
      }
      onLoginSuccess(data.user);
      navigate("/");
    } catch (err) {
      console.error(err);
      setError("Server error while logging in.");
    }
  };

  const handleGoogleUser = (user) => {
    onLoginSuccess(user);
    navigate("/");
  };

  /* ── 100% inline styles — no CSS class dependencies ── */
  const containerStyle = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #0b2149 0%, #08152f 70%)",
    padding: "1.5rem",
  };

  const cardStyle = {
    width: "100%",
    maxWidth: 420,
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 18,
    padding: "2.25rem 2rem",
    boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
    textAlign: "center",
    color: "#e5e7eb",
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    fontSize: "0.95rem",
    background: "#0b1222",
    color: "#e5e7eb",
    outline: "none",
    boxSizing: "border-box",
  };

  const btnStyle = {
    width: "100%",
    padding: "12px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(135deg, #2563eb, #4f46e5)",
    color: "#fff",
    fontSize: "1rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {/* Logo + Title */}
        <img
          src="/logo/logo.png"
          alt="RailSmart"
          style={{ height: 48, marginBottom: 12 }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
        <h2 style={{ margin: "0 0 4px", fontSize: "1.35rem", fontWeight: 700 }}>
          Welcome to RailSmart <Train size={20} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
        </h2>
        <p style={{ margin: "0 0 1.5rem", fontSize: "0.875rem", color: "#9ca3af" }}>
          Book tickets & track trains intelligently
        </p>

        {/* Error message */}
        {error && (
          <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: "0.85rem" }}>
            {error}
          </div>
        )}

        {/* Email */}
        <div style={{ marginBottom: 14, textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem", color: "#9ca3af" }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 14, textAlign: "left" }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: "0.9rem", color: "#9ca3af" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

        {/* Sign in button */}
        <button type="button" onClick={handleEmailLogin} style={btnStyle}>
          Sign in
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", color: "#9ca3af", fontSize: "0.85rem" }}>
          <div style={{ flex: 1, height: 1, background: "#334155" }} />
          <span>OR</span>
          <div style={{ flex: 1, height: 1, background: "#334155" }} />
        </div>

        {/* Google button */}
        <div style={{ marginBottom: 12 }}>
          {showGoogle ? (
            <Suspense
              fallback={<p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: 0 }}>Loading Google Sign-In...</p>}
            >
              <LazyGoogleButton onLoginSuccess={handleGoogleUser} />
            </Suspense>
          ) : (
            <p style={{ color: "#9ca3af", fontSize: "0.85rem", margin: 0 }}>Loading Google Sign-In...</p>
          )}
        </div>

        {/* Footer */}
        <p style={{ margin: "1.5rem 0 0", fontSize: "0.8rem", color: "#6b7280" }}>
          Don't have an account?{" "}
          <span
            style={{ color: "#60a5fa", cursor: "pointer" }}
            onClick={() => navigate("/register")}
          >
            Register here
          </span>
        </p>

        <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "#4b5563" }}>
          © 2025–2026 RailSmart — Intelligent Railway Ticketing
        </p>
      </div>
    </div>
  );
}

export default Login;
