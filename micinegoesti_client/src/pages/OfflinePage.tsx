import { Link } from "react-router-dom";
import { GrillRunner } from "../components/GrillRunner";

export function OfflinePage() {
  return (
    <main className="offline-page">
      <div className="offline-shell">
        <Link to="/" className="login-brand">
          <img src="/assets/brand/cropped-LogoWebsite.png" alt="Mici de Negoești" />
          <span>Mici de Negoești</span>
        </Link>
        <GrillRunner title="Ești offline" subtitle="Poți juca până revine conexiunea." />
      </div>
    </main>
  );
}
