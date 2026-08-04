import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminPage } from "./pages/AdminPage";
import { OfflinePage } from "./pages/OfflinePage";

const STAFF_ROLES = new Set(["admin", "store_manager", "kitchen", "deliverer"]);
const STOREFRONT_URL = (import.meta.env.VITE_STOREFRONT_URL?.trim() || "http://localhost:5173").replace(/\/+$/, "");

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="section-shell">Se încarcă...</div>;
  if (!user || !STAFF_ROLES.has(user.role)) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/admin-login?returnTo=${returnTo}`} replace />;
  }

  return <>{children}</>;
}

function StorefrontRedirect() {
  const location = useLocation();
  const target = `${STOREFRONT_URL}${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return <div className="section-shell">Se deschide magazinul...</div>;
}

export function App() {
  const online = useOnlineStatus();

  if (!online) return <OfflinePage />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin-login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminOnly><AdminPage /></AdminOnly>} />
      <Route path="/offline" element={<OfflinePage />} />
      <Route path="/login" element={<StorefrontRedirect />} />
      <Route path="/register" element={<StorefrontRedirect />} />
      <Route path="/privacy" element={<StorefrontRedirect />} />
      <Route path="/track" element={<StorefrontRedirect />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
