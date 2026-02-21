import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import ErrorBoundary from "../components/ErrorBoundary.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import UserLayout from "../layouts/UserLayout.jsx";
import useAuth from "../auth/useAuth";
import AdminRoute from "./AdminRoute.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";

import Login from "../pages/Login.jsx";
import Register from "../pages/Register.jsx";

import UserDashboard from "../pages/user/UserDashboard.jsx";
import Trains from "../pages/user/Trains.jsx";
import MyTickets from "../pages/user/MyTickets.jsx";
import TrackTrain from "../pages/user/TrackTrain.jsx";

const AdminOverview = lazy(() => import("../pages/admin/AdminOverview.jsx"));
const AdminAnalytics = lazy(() => import("../pages/admin/AdminAnalytics.jsx"));
const AdminAuditLogs = lazy(() => import("../pages/admin/AdminAuditLogs.jsx"));
const AdminMonitoring = lazy(() => import("../pages/admin/AdminMonitoring.jsx"));

function LazyFallback() {
  return <div className="rs-helper-text">Loading...</div>;
}

export default function AppRoutes() {
  const { user, setUser, loading, hasVerifiedSession, refreshUser } = useAuth();

  const handleLoginSuccess = async (loggedInUser) => {
    setUser(loggedInUser || null);
    await refreshUser();
  };

  if (loading) {
    return null;
  }

  return (
    <ErrorBoundary title="RailSmart UI Error">
      <Routes>
        <Route
          path="/login"
          element={
            user && hasVerifiedSession ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <ErrorBoundary title="Login Error">
                <Login onLoginSuccess={handleLoginSuccess} />
              </ErrorBoundary>
            )
          }
        />

        <Route path="/register" element={<Register />} />

        <Route
          element={
            <ProtectedRoute>
              <UserLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/dashboard"
            element={
              <ErrorBoundary title="Dashboard Error">
                <UserDashboard />
              </ErrorBoundary>
            }
          />

          <Route
            path="/trains"
            element={
              <ErrorBoundary title="Booking Error">
                <Trains />
              </ErrorBoundary>
            }
          />

          <Route
            path="/tickets"
            element={
              <ErrorBoundary title="My Tickets Error">
                <MyTickets />
              </ErrorBoundary>
            }
          />

          <Route
            path="/track"
            element={
              <ErrorBoundary title="Track Train Error">
                <TrackTrain />
              </ErrorBoundary>
            }
          />
        </Route>

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route
            index
            element={
              <ErrorBoundary title="Dashboard Error">
                <Suspense fallback={<LazyFallback />}>
                  <AdminOverview />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="analytics"
            element={
              <ErrorBoundary title="Analytics Error">
                <Suspense fallback={<LazyFallback />}>
                  <AdminAnalytics />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="audit"
            element={
              <ErrorBoundary title="Audit Logs Error">
                <Suspense fallback={<LazyFallback />}>
                  <AdminAuditLogs />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="monitoring"
            element={
              <ErrorBoundary title="Monitoring Error">
                <Suspense fallback={<LazyFallback />}>
                  <AdminMonitoring />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
