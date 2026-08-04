import { Flame } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { normalizePhoneForSubmit } from "../lib/phone";

type LoginPageProps = {
  mode?: "login" | "register";
};

export function LoginPage({ mode = "login" }: LoginPageProps) {
  const { sendCode, verifyCode } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(params.get("phone") ?? "+40 ");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const returnTo = params.get("returnTo") || "/";
  const isRegister = mode === "register";
  const returnQuery = returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="login-page">
      <Link className="login-brand" to="/">
        <img src="/assets/brand/cropped-LogoWebsite.png" alt="Mici de Negoești" />
        <span>Mici de Negoești</span>
      </Link>
      <form
        className="login-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          try {
            const normalizedPhone = normalizePhoneForSubmit(phone);
            setPhone(normalizedPhone);
            setSubmitting(true);
            if (!sent) {
              const response = await sendCode(normalizedPhone);
              setDevCode(response.devCode);
              setSent(true);
            } else {
              await verifyCode(normalizedPhone, code, { name: name || undefined });
              navigate(returnTo, { replace: true });
            }
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Autentificarea nu a reușit.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Flame size={32} />
        <div className="auth-mode-tabs">
          <Link className={!isRegister ? "active" : ""} to={`/login${returnQuery}`}>Autentificare</Link>
          <Link className={isRegister ? "active" : ""} to={`/register${returnQuery}`}>Înregistrare</Link>
        </div>
        <h1>{isRegister ? "Creează cont" : "Autentificare"}</h1>
        <p className="auth-copy">
          {isRegister
            ? "Primești un cod pe WhatsApp și salvăm prenumele pentru scorul din clasament."
            : "Primești un cod pe WhatsApp ca să intri rapid în cont."}
        </p>
        {isRegister && (
          <label>
            Nume
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
          </label>
        )}
        <label>
          Telefon
          <input
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSent(false);
              setCode("");
              setDevCode(undefined);
              setError(null);
            }}
            onFocus={() => {
              if (!phone.trim()) setPhone("+40 ");
            }}
            placeholder="+40 757 400 356"
            inputMode="tel"
            autoComplete="tel"
            required
          />
        </label>
        {sent && (
          <>
            <label>
              Cod primit pe WhatsApp
              <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required />
            </label>
            {!isRegister && <p className="auth-hint">Dacă numărul nu are cont încă, îl creăm automat după verificare.</p>}
          </>
        )}
        <button className="primary-button" disabled={submitting}>
          {submitting
            ? sent ? "Se verifică..." : "Se trimite..."
            : sent ? (isRegister ? "Verifică și creează cont" : "Verifică și intră") : "Trimite codul"}
        </button>
        {devCode && <p className="dev-code">Cod dev: {devCode}</p>}
        {error && <p className="form-error">{error}</p>}
        <Link to="/admin-login">Autentificare admin</Link>
        <Link to="/privacy">Politica de confidențialitate</Link>
      </form>
    </main>
  );
}
