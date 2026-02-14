import React, { useState, useEffect } from "react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { jwtDecode } from "jwt-decode";

const GOOGLE_CLIENT_ID =
  "344227229403-d6d21564udh6equ1gca2tpi1rnng1oi2.apps.googleusercontent.com";

/* ── Error boundary — catches synchronous render crashes from Google SDK ── */
class GoogleButtonBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.warn("[GoogleLoginButton] SDK failed to render:", err.message);
  }
  render() {
    if (this.state.failed) {
      return <GoogleFallbackMsg />;
    }
    return this.props.children;
  }
}

const GoogleFallbackMsg = () => (
  <p style={{ color: "var(--rs-text-muted)", fontSize: "0.85rem", margin: 0, textAlign: "center" }}>
    Google Sign-In unavailable — use email &amp; password instead.
  </p>
);

/* ── Inner component: only rendered after SDK loads successfully ── */
function GoogleLoginInner({ onLoginSuccess }) {
  return (
    <GoogleLogin
      onSuccess={(credentialResponse) => {
        if (!credentialResponse.credential) return;
        const user = jwtDecode(credentialResponse.credential);
        try {
          if (user && user.email) {
            localStorage.setItem("userEmail", user.email);
          }
        } catch (e) {
          console.warn("Unable to write userEmail to localStorage", e);
        }
        onLoginSuccess(user);
      }}
      onError={() => {
        console.log("Google Login Failed");
      }}
    />
  );
}

/**
 * Self-contained Google login button.
 * - Loads GoogleOAuthProvider internally (not at app root)
 * - Catches async SDK errors via window listener
 * - Catches sync render errors via error boundary
 * - Never crashes the rest of the page
 */
const GoogleLoginButton = ({ onLoginSuccess }) => {
  const [sdkError, setSdkError] = useState(false);

  useEffect(() => {
    // Catch the async GSI script errors that error boundaries can't catch
    const handler = (event) => {
      const msg = event?.message || event?.reason?.message || "";
      if (
        msg.includes("GSI") ||
        msg.includes("google") ||
        msg.includes("gsi/client") ||
        msg.includes("origin is not allowed")
      ) {
        event.preventDefault?.();
        console.warn("[GoogleLoginButton] Suppressed async Google SDK error:", msg);
        setSdkError(true);
      }
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", handler);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", handler);
    };
  }, []);

  if (sdkError) {
    return <GoogleFallbackMsg />;
  }

  return (
    <GoogleButtonBoundary>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <GoogleLoginInner onLoginSuccess={onLoginSuccess} />
      </GoogleOAuthProvider>
    </GoogleButtonBoundary>
  );
};

export default GoogleLoginButton;
