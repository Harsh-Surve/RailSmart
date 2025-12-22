import { useState } from "react";

function Register({ onRegistered, onSwitchToLogin }) {
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
        setMsg("Registration successful! You can now log in.");
        onRegistered();
      } else {
        setMsg(data.error || "Registration failed");
      }
    } catch (err) {
      console.error("Register error:", err);
      setMsg("Server error");
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "1.5rem" }}>
          <img
            src="/logo/logo.png"
            alt="RailSmart"
            style={{
              height: "40px",
              marginBottom: "0.5rem",
              filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))",
            }}
          />
          <h2 className="auth-title" style={{ margin: "0.5rem 0" }}>
            Create your RailSmart account
          </h2>
          <p className="auth-subtitle" style={{ textAlign: "center" }}>
            Register once and manage all your train bookings from one place.
          </p>
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

          <button type="submit" className="btn btn-primary">
            Register
          </button>
        </form>

        <button
          onClick={onSwitchToLogin}
          className="btn btn-secondary"
          style={{ marginTop: 10 }}
        >
          Already registered? Login
        </button>

        {msg && (
          <div className="message message-info" style={{ marginTop: 10 }}>
            {msg}
          </div>
        )}
      </div>
    </div>
  );
}

export default Register;
