import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!name || !email || !password) {
      setMsg("Please fill all fields");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setMsg("Registration successful! Redirecting to login...");
        setTimeout(() => navigate("/login"), 1500);
      } else {
        setMsg(data.error || "Registration failed");
      }
    } catch (err) {
      console.error("Register error:", err);
      setMsg("Server error");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card fade-in">
        <div className="auth-header">
          <img src="/logo/logo.png" alt="RailSmart" className="auth-logo" />
          <h2>Create your RailSmart account</h2>
          <p>Register once and manage all your train bookings from one place.</p>
        </div>

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>Name</label>
            <input
              className="form-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="form-group">
            <label>Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
            />
          </div>

          <button type="submit" className="primary-btn">
            Register
          </button>
        </form>

        <button
          onClick={() => navigate("/login")}
          className="forgot"
          style={{ marginTop: "0.75rem" }}
        >
          Already registered? Login
        </button>

        {msg && (
          <div className="auth-message">
            {msg}
          </div>
        )}

        <p className="auth-footer">
          © 2025–2026 RailSmart — Intelligent Railway Ticketing
        </p>
      </div>
    </div>
  );
}

export default Register;
