import { Eye, EyeOff, Flame } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AdminLoginPage() {
  const { adminLogin } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnTo = params.get("returnTo") || "/admin";

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
          setSubmitting(true);
          try {
            await adminLogin(login, password);
            navigate(returnTo, { replace: true });
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Autentificarea nu a reușit.");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <Flame size={32} />
        <h1>Autentificare admin</h1>
        <p className="auth-copy">Folosește emailul sau telefonul de admin și parola setată în Render.</p>

        <label>
          Email sau telefon
          <input value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" required />
        </label>

        <label>
          Parolă
          <div className="password-field">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="icon-button password-toggle"
              aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <button className="primary-button" disabled={submitting}>
          {submitting ? "Se verifică..." : "Intră în admin"}
        </button>

        {error && <p className="form-error">{error}</p>}
        <Link to="/login">Autentificare client</Link>
        <Link to="/privacy">Politica de confidențialitate</Link>
      </form>
    </main>
  );
}
