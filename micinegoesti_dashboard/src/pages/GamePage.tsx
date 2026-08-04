import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { GameLeaderboard } from "../components/GameLeaderboard";
import { GrillRunner } from "../components/GrillRunner";
import { useAuth } from "../context/AuthContext";

export function GamePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    stageRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <section className="section-shell game-page">
      <div className="game-page-head">
        <div className="section-title">
          <span>Joc</span>
          <h1>Aventura Micului</h1>
        </div>
        {user && (
          <div className="game-user-chip">
            <Trophy size={17} />
            <span>{user.name ?? user.phone}</span>
          </div>
        )}
      </div>

      <div className="game-layout game-layout-stacked">
        <div className="game-stage" ref={stageRef}>
          <GrillRunner
            title="Aventura Micului"
            subtitle="Sari peste obstacole și ferește micii de tigaile de sus."
            showHomeButton={false}
            onScoreSaved={() => queryClient.invalidateQueries({ queryKey: ["game-leaderboard"] })}
          />
        </div>
        <GameLeaderboard showMenuLink />
      </div>
    </section>
  );
}
