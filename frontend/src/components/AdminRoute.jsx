// src/components/AdminRoute.jsx
import React, { useMemo } from "react";
import { Navigate } from "react-router-dom";

const ADMIN_EMAILS = ["harshsurve022@gmail.com"];

export default function AdminRoute({ children }) {
  // Check admin status synchronously from localStorage
  const authResult = useMemo(() => {
    const userStr = localStorage.getItem("user");
    
    if (!userStr) {
      return { allowed: false, redirect: "/login" };
    }

    try {
      const user = JSON.parse(userStr);
      const email = (user.email || "").toLowerCase();
      const isAdmin = ADMIN_EMAILS.includes(email);

      if (!isAdmin) {
        return { allowed: false, redirect: "/trains" };
      }

      return { allowed: true, redirect: null };
    } catch (err) {
      console.error("Error parsing user:", err);
      return { allowed: false, redirect: "/login" };
    }
  }, []);

  if (!authResult.allowed) {
    return <Navigate to={authResult.redirect} replace />;
  }

  return children;
}
