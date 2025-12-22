// src/components/AdminRoute.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ADMIN_EMAILS = ["harshsurve022@gmail.com"];

export default function AdminRoute({ children }) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if user object exists in localStorage
    const userStr = localStorage.getItem("user");
    
    if (!userStr) {
      // not logged in → go to login
      navigate("/login");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      const email = (user.email || "").toLowerCase();
      const isAdmin = ADMIN_EMAILS.includes(email);

      if (!isAdmin) {
        // logged in but not admin → send to normal area
        navigate("/trains");
        return;
      }

      setAllowed(true);
      setChecking(false);
    } catch (err) {
      console.error("Error parsing user:", err);
      navigate("/login");
    }
  }, [navigate]);

  if (checking) return null; // or a loader

  return allowed ? children : null;
}
