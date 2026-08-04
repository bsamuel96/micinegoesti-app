import { useInfiniteQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const PAGE_SIZE = 50;
const VISIBLE_STEP = 5;

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}z ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function useCampaignClock(startsAt?: string, endsAt?: string, serverTime?: string) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startsAt || !endsAt) return;
    const serverOffset = serverTime
      ? new Date(serverTime).getTime() - Date.now()
      : 0;
    const updateClock = () => setNow(Date.now() + serverOffset);
    updateClock();
    const intervalId = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(intervalId);
  }, [endsAt, serverTime, startsAt]);

  const start = startsAt ? new Date(startsAt).getTime() : 0;
  const end = endsAt ? new Date(endsAt).getTime() : 0;
  return {
    beforeStart: Boolean(start && now < start),
    remaining: start && now < start ? start - now : Math.max(0, end - now)
  };
}

export function GameLeaderboard({ showMenuLink = false }: { showMenuLink?: boolean }) {
  const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP);
  const leaderboard = useInfiniteQuery({
    queryKey: ["game-leaderboard"],
    queryFn: ({ pageParam }) => api.gameLeaderboard({ limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore
        ? pages.reduce((count, page) => count + page.scores.length, 0)
        : undefined,
    refetchInterval: 10_000
  });

  const firstPage = leaderboard.data?.pages[0];
  const campaign = firstPage?.campaign ?? null;
  const campaignKey = `${firstPage?.mode ?? "unknown"}:${campaign?.id ?? "none"}`;
  const scores = useMemo(
    () => leaderboard.data?.pages.flatMap((page) => page.scores) ?? [],
    [leaderboard.data?.pages]
  );
  const total = firstPage?.total ?? 0;
  const clock = useCampaignClock(campaign?.startsAt, campaign?.endsAt, firstPage?.serverTime);

  useEffect(() => {
    setVisibleCount(VISIBLE_STEP);
  }, [campaignKey]);

  const shownScores = scores.slice(0, visibleCount);
  const canShowMore = visibleCount < total;

  return (
    <aside className="game-leaderboard game-leaderboard-expanded" aria-label="Clasament joc">
      {!firstPage ? null : firstPage.mode === "campaign" && campaign ? (
        <section className={`game-campaign-banner is-${campaign.status}`}>
          <div>
            <span className="eyebrow">Campanie</span>
            <h2>{campaign.name}</h2>
          </div>
          <div className="game-campaign-timer">
            <span>{campaign.status === "finished" ? "Campanie încheiată" : clock.beforeStart ? "Începe în" : "Se încheie în"}</span>
            <strong>{campaign.status === "finished" ? "Premiile au fost stabilite" : formatCountdown(clock.remaining)}</strong>
          </div>
          <div className="game-campaign-prizes" aria-label="Premiile campaniei">
            <span><Trophy size={15} aria-hidden="true" /> Locul 1: {campaign.prizes[0]}%</span>
            <span>Locul 2: {campaign.prizes[1]}%</span>
            <span>Locul 3: {campaign.prizes[2]}%</span>
          </div>
        </section>
      ) : firstPage.mode === "campaign" ? (
        <div className="game-campaign-empty">
          <span className="eyebrow">Campanie</span>
          <h2>Nicio campanie configurată</h2>
          <p>Clasamentul pornește odată cu următoarea campanie.</p>
        </div>
      ) : (
        <div>
          <span className="eyebrow">Metodă disponibilă</span>
          <h2>Record instant</h2>
        </div>
      )}

      <div className="game-leaderboard-heading">
        <div>
          <span className="eyebrow">Top scoruri</span>
          <h2>{firstPage?.mode === "campaign" ? "Clasamentul campaniei" : "Clasament general"}</h2>
        </div>
        <strong>{total} participanți</strong>
      </div>

      {leaderboard.isLoading ? (
        <p>Se încarcă...</p>
      ) : shownScores.length ? (
        <ol>
          {shownScores.map((score, index) => (
            <li key={score.id}>
              <span className="game-leaderboard-rank">{index + 1}</span>
              <strong>{score.playerName}</strong>
              <span className="game-leaderboard-score">{score.bestScore}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p>Topul apare după primul scor eligibil.</p>
      )}

      {canShowMore ? (
        <button
          className="secondary-button game-leaderboard-more"
          type="button"
          disabled={leaderboard.isFetchingNextPage}
          onClick={async () => {
            const nextVisibleCount = Math.min(visibleCount + VISIBLE_STEP, total);
            if (nextVisibleCount > scores.length && leaderboard.hasNextPage) {
              await leaderboard.fetchNextPage();
            }
            setVisibleCount(nextVisibleCount);
          }}
        >
          {leaderboard.isFetchingNextPage ? "Se încarcă..." : `+${Math.min(VISIBLE_STEP, total - visibleCount)} rezultate`}
        </button>
      ) : null}

      {leaderboard.error ? (
        <p className="form-error" role="alert">{leaderboard.error.message}</p>
      ) : null}

      {showMenuLink ? (
        <Link to="/menu" className="secondary-button">
          Înapoi la meniu
        </Link>
      ) : null}
    </aside>
  );
}
