import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Gamepad2, LogOut, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { IssuedVoucher } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { getGameSessionId } from "../lib/browserSession";

function voucherDiscountLabel(voucher: IssuedVoucher) {
  const value = voucher.discountType === "percentage" ? `${voucher.discountValue}%` : `${voucher.discountValue.toFixed(2)} lei`;
  return voucher.maximumDiscount ? `${value}, max. ${voucher.maximumDiscount.toFixed(2)} lei` : value;
}

function voucherStatusLabel(status: IssuedVoucher["status"]) {
  if (status === "active") return "Activ";
  if (status === "pending") return "În aprobare";
  if (status === "expired") return "Expirat";
  if (status === "redeemed") return "Folosit";
  return "Revocat";
}

export function AccountPage() {
  const { user, logout } = useAuth();
  const sessionId = useMemo(() => getGameSessionId(user?.id), [user?.id]);
  const isCustomer = user?.role === "customer";
  const vouchers = useQuery({
    queryKey: ["my-vouchers", sessionId, user?.id],
    queryFn: () => api.myVouchers(sessionId),
    enabled: Boolean(user && !isCustomer)
  });
  const score = useQuery({
    queryKey: ["account-game-score", sessionId, user?.id],
    queryFn: () => api.gameScore(sessionId),
    enabled: Boolean(isCustomer)
  });

  if (!user) {
    return (
      <section className="section-shell account-page-v2">
        <div className="account-guest-card">
          <span><Sparkles size={16} /> Contul tău</span>
          <h1>Intră în cont ca să-ți păstrezi scorul</h1>
          <p>Prenumele și cel mai bun scor sunt salvate automat în clasamentul jocului.</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/login">Autentificare</Link>
            <Link className="secondary-button" to="/register">Înregistrare</Link>
          </div>
          <Link to="/privacy">Politica de confidențialitate</Link>
        </div>
      </section>
    );
  }

  const roleLabel =
    user.role === "admin"
      ? "Administrator"
      : user.role === "store_manager"
        ? "Manager magazin"
        : user.role === "kitchen"
          ? "Bucătărie"
          : user.role === "deliverer"
            ? "Curier"
            : "Client";

  if (isCustomer) {
    const savedScore = score.data?.bestScore ?? 0;

    return (
      <section className="section-shell account-page-v2">
        <div className="account-hero-card">
          <div className="account-hero-head">
            <div className="account-avatar-badge"><UserRound size={20} /></div>
            <div>
              <span>Cont de joc</span>
              <h1>{user.name ?? user.phone}</h1>
            </div>
            <div className="account-role-chip"><Trophy size={14} /> Jucător</div>
          </div>

          <div className="account-meta-grid">
            <article className="account-meta-card">
              <span>Telefon</span>
              <strong>{user.phone}</strong>
            </article>
            <article className="account-meta-card">
              <span>Scor salvat</span>
              <strong>
                {score.isLoading
                  ? "Se încarcă..."
                  : savedScore > 0
                    ? savedScore
                    : "Niciun scor încă"}
              </strong>
            </article>
            <article className="account-meta-card">
              <span>Nume în clasament</span>
              <strong>{score.data?.playerName || user.name?.trim().split(/\s+/)[0] || "—"}</strong>
            </article>
          </div>
          {score.isError && <p className="form-error">Scorul nu a putut fi încărcat. Reîncearcă după reautentificare.</p>}
        </div>

        <div className="account-quick-actions">
          <Link className="secondary-button" to="/game"><Gamepad2 size={16} /> Deschide jocul</Link>
          <button className="primary-button" onClick={logout}><LogOut size={16} /> Ieși din cont</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section-shell account-page-v2">
      <div className="account-hero-card">
        <div className="account-hero-head">
          <div className="account-avatar-badge"><UserRound size={20} /></div>
          <div>
            <span>Cont</span>
            <h1>{user.name ?? user.phone}</h1>
          </div>
          <div className="account-role-chip"><ShieldCheck size={14} /> {roleLabel}</div>
        </div>

        <div className="account-meta-grid">
          <article className="account-meta-card">
            <span>Telefon</span>
            <strong>{user.phone}</strong>
          </article>
          <article className="account-meta-card">
            <span>Email</span>
            <strong>{user.email || "Necompletat"}</strong>
          </article>
          <article className="account-meta-card">
            <span>Rol</span>
            <strong>{roleLabel}</strong>
          </article>
        </div>
      </div>

      <div className="account-quick-actions">
        {["admin", "store_manager", "deliverer", "kitchen"].includes(user.role) && (
          <Link className="secondary-button" to="/orders"><ClipboardList size={16} /> Comenzi</Link>
        )}
        {["admin", "store_manager", "deliverer", "kitchen"].includes(user.role) && <Link className="secondary-button" to="/admin"><ShieldCheck size={16} /> Panou administrare</Link>}
        <button className="primary-button" onClick={logout}><LogOut size={16} /> Ieși din cont</button>
      </div>

      <section className="account-vouchers">
        <div className="section-title compact-title">
          <span>Beneficii</span>
          <h2>Voucherele mele</h2>
        </div>
        {vouchers.isLoading ? (
          <p>Se încarcă voucherele...</p>
        ) : vouchers.data?.vouchers.length ? (
          <div className="account-voucher-list">
            {vouchers.data.vouchers.map((voucher) => (
              <article className="account-voucher" key={voucher.id}>
                <div>
                  <span>{voucherStatusLabel(voucher.status)}</span>
                  <h3>{voucher.code ?? "Cod disponibil după aprobare"}</h3>
                </div>
                <p>{voucher.name}</p>
                <strong>{voucherDiscountLabel(voucher)}</strong>
                <small>Expiră: {voucher.expiresAt ? new Date(voucher.expiresAt).toLocaleDateString("ro-RO") : "fără limită"}</small>
              </article>
            ))}
          </div>
        ) : (
          <p>Nu ai vouchere active sau în aprobare.</p>
        )}
      </section>
    </section>
  );
}
