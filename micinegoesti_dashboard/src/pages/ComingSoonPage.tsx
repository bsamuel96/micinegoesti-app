import { useQueryClient } from "@tanstack/react-query";
import { LogIn } from "lucide-react";
import { Link } from "react-router-dom";
import { GameLeaderboard } from "../components/GameLeaderboard";
import { GrillRunner } from "../components/GrillRunner";

const tickerText = "Se gătește ceva bun • Stai aproape • Coming soon";

export function ComingSoonPage() {
  const queryClient = useQueryClient();

  return (
    <main className="cs-page">

      {/* Brand bar */}
      <div className="cs-brand-bar">
        <span className="login-brand">
          <img src="/assets/brand/cropped-LogoWebsite.png" alt="Mici de Negoești" />
          <span>Mici de Negoești</span>
        </span>
        <Link className="cs-admin-login" to="/admin-login" aria-label="Autentificare admin">
          <LogIn size={18} aria-hidden="true" />
          <span>Autentificare admin</span>
        </Link>
      </div>

      {/* Hero */}
      <section className="cs-hero">
        <span className="eyebrow">Curând disponibil</span>
        <h1>Se gătește ceva bun 🔥</h1>
        <p>
          Lucrăm la ceva extraordinar. Revenim în curând cu preparate noi
          și o experiență îmbunătățită.
        </p>
        <div className="hero-badges">
          <span>🥩 Pe grătar</span>
          <span>🌿 Ingrediente naturale</span>
          <span>⏳ Curând</span>
        </div>
      </section>

      {/* Ticker */}
      <div className="ticker" aria-label="Anunț">
        <div className="ticker-track">
          {Array.from({ length: 10 }).map((_, i) => (
            <span className="ticker-item" key={`a${i}`}>{tickerText}</span>
          ))}
        </div>
        <div className="ticker-track" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <span className="ticker-item" key={`b${i}`}>{tickerText}</span>
          ))}
        </div>
      </div>

      {/* Game */}
      <div className="cs-game-shell">
        <div className="section-shell">
          <div className="section-title" style={{ marginBottom: 8 }}>
            <span>Cât aștepți</span>
            <h2>Joacă-te cu noi 🎮</h2>
          </div>
          <p style={{ margin: "0 0 28px", color: "var(--mdn-text-soft)", fontSize: 15 }}>
            Până pregătim surpriza, sari peste obstacole cu micul nostru erou.
          </p>
          <div className="game-layout game-layout-stacked">
            <div className="game-stage">
              <GrillRunner
                title="Aventura Micului"
                subtitle="Sari peste obstacole și ferește micii de tigaile de sus."
                showHomeButton={false}
                onScoreSaved={() =>
                  queryClient.invalidateQueries({ queryKey: ["game-leaderboard"] })
                }
              />
            </div>
            <GameLeaderboard />
          </div>
        </div>
      </div>

      {/* Footer note */}
      <p className="cs-bottom">
        Revenim în curând cu ceva extraordinar. Mulțumim pentru răbdare! 🙏
      </p>

    </main>
  );
}
