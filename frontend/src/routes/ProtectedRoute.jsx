import { Navigate } from "react-router-dom";
import useAuth from "../auth/useAuth";

export default function ProtectedRoute({ children, redirectTo = "/login" }) {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
