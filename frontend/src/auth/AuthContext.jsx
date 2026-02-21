import { useCallback, useEffect, useMemo, useState } from "react";
import AuthContext from "./AuthContextObject";

const API_BASE_URL = "http://localhost:5000";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasVerifiedSession, setHasVerifiedSession] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Unable to verify session");
      }

      const data = await res.json().catch(() => ({}));
      const verifiedUser = data?.user || data || null;

      if (verifiedUser?.email) {
        setUser(verifiedUser);
        setHasVerifiedSession(true);
      } else {
        setUser(null);
        setHasVerifiedSession(false);
      }
    } catch {
      setUser(null);
      setHasVerifiedSession(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore network errors and clear local auth state anyway
    }

    setUser(null);
    setHasVerifiedSession(false);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, hasVerifiedSession, refreshUser, logout }),
    [hasVerifiedSession, loading, logout, refreshUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
