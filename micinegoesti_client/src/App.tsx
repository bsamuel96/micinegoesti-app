import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useAuth } from "./context/AuthContext";
import { AboutPage } from "./pages/AboutPage";
import { AccountPage } from "./pages/AccountPage";
import { CartPage } from "./pages/CartPage";
import { CartUpsellPage } from "./pages/CartUpsellPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { ContactPage } from "./pages/ContactPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { FooterInfoPage } from "./pages/FooterInfoPage";
import { GamePage } from "./pages/GamePage";
import { HomePage } from "./pages/HomePage";
import { LegalPage } from "./pages/LegalPage";
import { LoginPage } from "./pages/LoginPage";
import { MenuPage } from "./pages/MenuPage";
import { OfflinePage } from "./pages/OfflinePage";
import { OrdersPage } from "./pages/OrdersPage";
import { ReviewsPage } from "./pages/ReviewsPage";
import { TrackOrderPage } from "./pages/TrackOrderPage";

const STAFF_ROLES = new Set(["admin", "store_manager", "kitchen", "deliverer"]);
const PUBLIC_WHILE_COMING_SOON = new Set(["/login", "/register", "/track", "/admin", "/admin-login"]);
const DASHBOARD_URL = (import.meta.env.VITE_DASHBOARD_URL?.trim() || "http://localhost:5174").replace(/\/+$/, "");

function ComingSoonGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if ((user && STAFF_ROLES.has(user.role)) || PUBLIC_WHILE_COMING_SOON.has(location.pathname)) return <>{children}</>;
  return <ComingSoonPage />;
}

function DashboardRedirect() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname === "/admin" ? "/admin" : "/admin-login";
    window.location.replace(`${DASHBOARD_URL}${path}${location.search}`);
  }, [location.pathname, location.search]);

  return <main className="section-shell">Te redirecționăm către panoul echipei…</main>;
}

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

function MobileHomeRoute() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 920px)").matches);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 920px)");
    const onChange = () => setIsMobile(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return isMobile ? <Navigate to="/menu" replace /> : <HomePage />;
}

export function App() {
  const online = useOnlineStatus();
  if (!online) return <OfflinePage />;

  return (
    <ComingSoonGate>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<MobileHomeRoute />} />
          <Route path="/menu" element={<MenuPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/cart/upsell" element={<CartUpsellPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/track" element={<TrackOrderPage />} />
          <Route path="/footer-info" element={<FooterInfoPage />} />
          <Route path="/privacy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />
          <Route path="/coming-soon" element={<ComingSoonPage />} />
        </Route>
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<LoginPage mode="register" />} />
        <Route path="/admin" element={<DashboardRedirect />} />
        <Route path="/admin-login" element={<DashboardRedirect />} />
        <Route path="/offline" element={<OfflinePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ComingSoonGate>
  );
}
