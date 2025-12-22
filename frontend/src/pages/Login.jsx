import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import GoogleLoginButton from "../components/GoogleLoginButton.jsx";

function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login"); // "login" or "forgot"
  
  // Email/password login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      alert("Please enter email and password.");
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
        alert(data.error || "Invalid email or password.");
        return;
      }

      // Call parent's success handler
      onLoginSuccess(data.user);
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Server error while logging in.");
    }
  };

  const handleGoogleUser = (user) => {
    // update auth state in App
    onLoginSuccess(user);
    // go to main dashboard after login
    navigate("/");
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      alert("Please enter your email address.");
      return;
    }
    // Demo UI only - in production this would call backend
    alert(
      `Password reset link would be sent to ${forgotEmail}\n\n(Demo UI only - backend email integration pending)`
    );
    setForgotEmail("");
    setMode("login");
  };

  const isLogin = mode === "login";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          backgroundColor: "var(--rs-card-bg)",
          border: "1px solid var(--rs-border)",
          borderRadius: "1rem",
          boxShadow: "var(--rs-shadow)",
          padding: "2.5rem 2rem",
          textAlign: "center",
        }}
      >
        {/* Logo + title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "2rem",
          }}
        >
          <img
            src="/logo/logo.png"
            alt="RailSmart"
            style={{
              height: "40px",
              marginBottom: "0.75rem",
              filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))",
            }}
          />
          <h1
            style={{
              margin: "0",
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "var(--rs-text-main)",
            }}
          >
            {isLogin ? "Welcome to RailSmart" : "Reset your password"}
          </h1>
          <p
            style={{
              margin: "0.5rem 0 0 0",
              fontSize: "0.875rem",
              color: "var(--rs-text-muted)",
              textAlign: "center",
            }}
          >
            {isLogin
              ? "Sign in to manage your journeys"
              : "Enter your registered email to receive reset instructions"}
          </p>
        </div>

        {/* Animated content container */}
        <div style={{ position: "relative", minHeight: "280px" }}>
          {/* Login view */}
          <form
            onSubmit={handleEmailLogin}
            style={{
              opacity: isLogin ? 1 : 0,
              pointerEvents: isLogin ? "auto" : "none",
              position: isLogin ? "relative" : "absolute",
              inset: 0,
              transition: "opacity 200ms",
            }}
          >
            {/* Email field */}
            <div style={{ textAlign: "left", marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--rs-text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rs-input"
              />
            </div>

            {/* Password field */}
            <div style={{ textAlign: "left", marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--rs-text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rs-input"
              />
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              className="rs-btn-primary"
              style={{ borderRadius: "9999px", marginBottom: "1rem" }}
            >
              Sign in
            </button>

            {/* Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                margin: "1rem 0",
              }}
            >
              <div style={{ height: "1px", flex: 1, backgroundColor: "var(--rs-border)" }} />
              <span
                style={{
                  fontSize: "0.625rem",
                  color: "var(--rs-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                or
              </span>
              <div style={{ height: "1px", flex: 1, backgroundColor: "var(--rs-border)" }} />
            </div>

            {/* Google sign-in */}
            <div style={{ marginBottom: "0.75rem" }}>
              <GoogleLoginButton onLoginSuccess={handleGoogleUser} />
            </div>

            {/* Forgot password link */}
            <button
              type="button"
              onClick={() => setMode("forgot")}
              style={{
                width: "100%",
                fontSize: "0.75rem",
                color: "#2563eb",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0.5rem",
                textAlign: "center",
              }}
              onMouseOver={(e) => (e.target.style.color = "#1d4ed8")}
              onMouseOut={(e) => (e.target.style.color = "#2563eb")}
            >
              Forgot password?
            </button>
          </form>

          {/* Forgot password view */}
          <form
            onSubmit={handleForgotSubmit}
            style={{
              opacity: !isLogin ? 1 : 0,
              pointerEvents: !isLogin ? "auto" : "none",
              position: !isLogin ? "relative" : "absolute",
              inset: 0,
              transition: "opacity 200ms",
            }}
          >
            <div style={{ textAlign: "left", marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  color: "var(--rs-text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                Email address
              </label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                className="rs-input"
              />
            </div>

            <button
              type="submit"
              className="rs-btn-primary"
              style={{ borderRadius: "9999px" }}
            >
              Send reset link
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("login");
                setForgotEmail("");
              }}
              style={{
                width: "100%",
                marginTop: "0.75rem",
                fontSize: "0.75rem",
                color: "var(--rs-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0.5rem",
                textAlign: "center",
              }}
              onMouseOver={(e) => (e.target.style.color = "var(--rs-text-main)")}
              onMouseOut={(e) => (e.target.style.color = "var(--rs-text-muted)")}
            >
              ← Back to sign in
            </button>
          </form>
        </div>

        {/* Card footer text */}
        <p
          style={{
            marginTop: "2rem",
            fontSize: "0.6875rem",
            color: "var(--rs-text-muted)",
            textAlign: "center",
          }}
        >
          © 2025 RailSmart — Intelligent Railway Ticketing
        </p>
      </div>
    </div>
  );
}

export default Login;
