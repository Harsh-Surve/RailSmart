import { Navigate } from "react-router-dom";
import useAuth from "../auth/useAuth";

const ADMIN_EMAILS = ["harshsurve022@gmail.com"];
const NORMALIZED_ADMIN_EMAILS = ADMIN_EMAILS.map((email) => String(email).trim().toLowerCase());

export default function AdminRoute({ children }) {
  const { user, loading, hasVerifiedSession } = useAuth();

  if (loading) {
    return null;
  }

  const email = String(user?.email || "").trim().toLowerCase();
  const role = String(user?.role || "").trim().toLowerCase();
  const isAdmin = role === "admin" || NORMALIZED_ADMIN_EMAILS.includes(email);

  if (!user || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!hasVerifiedSession) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
