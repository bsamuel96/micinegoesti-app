import { useEffect, useRef, useState } from "react";
import { ArrowRight, ClipboardList, Facebook, Gamepad2, Instagram, Menu, Music2, ShieldCheck, ShoppingCart, UserRound, X } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { CookieConsent } from "./CookieConsent";

const logoUrl = "/assets/brand/cropped-LogoWebsite.png";

export function Layout() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isOperational = location.pathname === "/admin";

  if (isOperational) {
    return <Outlet />;
  }

  return (
    <>
      <div className={isHome ? "home-hero-shell" : undefined}>
      <Header isHome={isHome} />
      <main className={isHome ? "home-main" : undefined}>
        <Outlet />
      </main>
      </div>
      <Footer />
      <BottomNav />
      <CookieConsent />
    </>
  );
}

export function Header({ isHome = false }: { isHome?: boolean }) {
  const { user } = useAuth();
  const { count, subtotal } = useCart();
  const location = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);
  const [overLightBg, setOverLightBg] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const adminPanelPath = user && user.role !== "customer" ? "/admin" : "/admin-login";

  useEffect(() => {
    if (!isHome) {
      setOverLightBg(false);
      return;
    }

    const onScroll = () => {
      const threshold = Math.min(window.innerHeight * 0.56, 520);
      setOverLightBg(window.scrollY > threshold);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <header ref={headerRef} className={`site-header${isHome ? " site-header-home" : ""}${overLightBg ? " site-header-over-light" : ""}`}>
      <NavLink to="/" className="brand" aria-label="Mici de Negoești">
        <img src={logoUrl} alt="Mici de Negoești" />
      </NavLink>
      <nav className="desktop-nav" aria-label="Navigare principală">
        <NavLink to="/">Acasă</NavLink>
        <NavLink to="/menu">Meniu</NavLink>
        <NavLink to="/game">Joc</NavLink>
        <NavLink to="/about">Despre noi</NavLink>
        <NavLink to="/contact">Contact</NavLink>
      </nav>
      <div className="header-actions">
        <NavLink className="admin-panel-pill" to={adminPanelPath}>
          <ShieldCheck aria-hidden="true" size={18} />
          <span>Panou administrare</span>
        </NavLink>
        <NavLink className="cart-pill" to="/cart">
          <ShoppingCart size={18} />
          <span>{count ? `${count} / ${subtotal.toFixed(0)} lei` : "Coș"}</span>
        </NavLink>
        <NavLink className="account-pill" to={user ? "/account" : "/login"}>
          <UserRound size={18} />
          <span>{user?.name ?? user?.phone ?? "Intră cu telefon"}</span>
        </NavLink>
        <NavLink className="order-cta" to="/menu">
          <span>Comandă acum</span>
          <ArrowRight size={17} />
        </NavLink>
      </div>
      <div className="compact-header-actions">
        <NavLink className="cart-pill compact-cart-pill" to="/cart" aria-label={`Coș, ${count} produse`}>
          <ShoppingCart aria-hidden="true" size={19} />
          <span>{count > 0 ? count : "Coș"}</span>
        </NavLink>
        <button
          className="mobile-nav-toggle"
          type="button"
          aria-label={menuOpen ? "Închide meniul" : "Deschide meniul"}
          aria-controls="public-mobile-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
        </button>
      </div>
      {menuOpen && (
        <div className="mobile-nav-panel" id="public-mobile-navigation">
          <nav className="mobile-nav-links" aria-label="Navigare principală mobilă">
            <NavLink to="/">Acasă</NavLink>
            <NavLink to="/menu">Meniu</NavLink>
            <NavLink to="/game">Joc</NavLink>
            <NavLink to="/about">Despre noi</NavLink>
            <NavLink to="/contact">Contact</NavLink>
          </nav>
          <div className="mobile-nav-account-actions">
            <NavLink className="admin-panel-pill" to={adminPanelPath}>
              <ShieldCheck aria-hidden="true" size={18} />
              <span>Panou administrare</span>
            </NavLink>
            <NavLink className="account-pill" to={user ? "/account" : "/login"}>
              <UserRound aria-hidden="true" size={18} />
              <span>{user?.name ?? user?.phone ?? "Intră cu telefon"}</span>
            </NavLink>
            <NavLink className="order-cta" to="/menu">
              <span>Comandă acum</span>
              <ArrowRight aria-hidden="true" size={17} />
            </NavLink>
          </div>
        </div>
      )}
    </header>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      viewBox="0 0 448 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M380.9 97.1C339 55.1 283.2 32 223.9 32 101.5 32 1.9 131.6 1.9 254c0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1C346.2 476.1 448 376.5 448 254c0-59.3-25.2-115-67.1-156.9zM223.9 438.7c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"
      />
    </svg>
  );
}

function BottomNav() {
  const { count } = useCart();
  const { user } = useAuth();

  return (
    <nav className="bottom-nav" aria-label="Navigare mobilă">
      <span className="mdn-nav-loader" />
      <NavLink to="/menu">
        <Menu size={21} />
        <span>Meniu</span>
      </NavLink>
      <NavLink to="/cart">
        <ShoppingCart size={21} />
        <span>Coș</span>
        {count > 0 && <strong>{count}</strong>}
      </NavLink>
      {user?.role === "customer" ? (
        <NavLink to="/game">
          <Gamepad2 size={21} />
          <span>Scor</span>
        </NavLink>
      ) : (
        <NavLink to="/orders">
          <ClipboardList size={21} />
          <span>Comenzi</span>
        </NavLink>
      )}
      <NavLink to="/account">
        <UserRound size={21} />
        <span>Cont</span>
      </NavLink>
    </nav>
  );
}

function Footer() {
  return (
    <>
      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-brand-col">
            <div className="footer-brand-head">
              <img src={logoUrl} alt="Mici de Negoești" />
              <strong>Your Grill House - Mici de Negoești</strong>
            </div>
            <p>Gustul tradiției renăscut: micii autentici din Negoești, făcuți cu pasiune și rețeta bunicului.</p>
            <p className="footer-socials">
              <a href="https://www.facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook">
                <Facebook size={16} />
                <span>Facebook</span>
              </a>
              <a href="https://wa.me/40747232306" target="_blank" rel="noreferrer" aria-label="Whatsapp">
                <WhatsAppIcon className="footer-whatsapp-icon" />
                <span>Whatsapp</span>
              </a>
              <a href="https://www.tiktok.com" target="_blank" rel="noreferrer" aria-label="Tiktok">
                <Music2 size={16} />
                <span>Tiktok</span>
              </a>
              <a href="https://www.instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">
                <Instagram size={16} />
                <span>Instagram</span>
              </a>
            </p>
          </div>
          <div>
            <strong>Program</strong>
            <p>Luni–Sâmbătă: 09:00–21:00<br />Duminică: 07:00–19:00</p>
            <p>
              <span className="footer-label">Denumire firmă:</span> YOUR HOUSE SRL<br />
              <span className="footer-label">CUI:</span> 47597690<br />
              <span className="footer-label">Nr. Reg. Com.:</span> J2023000107515<br />
              <span className="footer-label">EUID:</span> ROONRC.J2023000107515
            </p>
          </div>
          <div>
            <strong>Cum dai de noi?</strong>
            <p>
              <span className="footer-label">Locația noastră</span><br />
              Șoseaua Olteniței, Nr. 66, Sat Negoești, CL
            </p>
            <p>
              <span className="footer-label">Sună-ne</span><br />
              <a href="tel:+40747232306">+40 747 232 306</a>
            </p>
            <div className="footer-anpc-badges">
              <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noreferrer" aria-label="Soluționarea Alternativă a Litigiilor">
                <img src="/assets/brand/anpc-sal.png" alt="Soluționarea Alternativă a Litigiilor" loading="lazy" />
              </a>
              <a href="https://ec.europa.eu/consumers/odr/main/index.cfm?event=main.home2.show&lng=RO" target="_blank" rel="noreferrer" aria-label="Soluționarea Online a Litigiilor">
                <img src="/assets/brand/anpc-sol.png" alt="Soluționarea Online a Litigiilor" loading="lazy" />
              </a>
            </div>
          </div>
        </div>
        <div className="footer-desktop-bottom-bar">
          <span>© 2026 Your Grill House. Toate drepturile rezervate. Design &amp; Development: </span>
          <a href="https://digitalromanian.com" target="_blank" rel="noreferrer">Digital Romanian</a>
        </div>
      </footer>

      <div className="mobile-footer-cta">
        <p>Pentru mai multe informații mergi la pagina:</p>
        <NavLink to="/footer-info">Pagina de detalii.</NavLink>
        <div className="mobile-footer-anpc">
          <a href="https://anpc.ro/ce-este-sal/" target="_blank" rel="noreferrer" aria-label="Soluționarea Alternativă a Litigiilor">
            <img src="/assets/brand/anpc-sal.png" alt="Soluționarea Alternativă a Litigiilor" loading="lazy" />
          </a>
          <a href="https://ec.europa.eu/consumers/odr/main/index.cfm?event=main.home2.show&lng=RO" target="_blank" rel="noreferrer" aria-label="Soluționarea Online a Litigiilor">
            <img src="/assets/brand/anpc-sol.png" alt="Soluționarea Online a Litigiilor" loading="lazy" />
          </a>
        </div>
        <p className="footer-credit">
          Implementare și design: <a href="https://digitalromanian.com" target="_blank" rel="noreferrer">Digital Romanian</a>
        </p>
      </div>
    </>
  );
}
