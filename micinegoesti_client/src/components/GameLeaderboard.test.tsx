// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import type { GameScore } from "../api/types";
import { GameLeaderboard } from "./GameLeaderboard";

vi.mock("../api/client", () => ({
  api: {
    gameLeaderboard: vi.fn()
  }
}));

const scores: GameScore[] = Array.from({ length: 12 }, (_, index) => ({
  id: `score-${index + 1}`,
  playerName: `Jucător ${index + 1}`,
  bestScore: 120 - index,
  updatedAt: "2026-07-28T10:00:00.000Z"
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GameLeaderboard", () => {
  it("shows five rows at a time until every participant is visible", async () => {
    vi.mocked(api.gameLeaderboard).mockResolvedValue({
      mode: "campaign",
      serverTime: "2026-07-28T10:00:00.000Z",
      campaign: {
        id: "campaign-1",
        name: "Campania test",
        status: "active",
        startsAt: "2026-07-28T09:00:00.000Z",
        endsAt: "2026-07-29T10:00:00.000Z",
        prizes: [15, 10, 5],
        minimumSubtotal: 0,
        codePrefix: "TEST",
        createdAt: "2026-07-28T08:00:00.000Z",
        updatedAt: "2026-07-28T08:00:00.000Z"
      },
      scores,
      total: scores.length,
      hasMore: false
    });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    render(
      <QueryClientProvider client={client}>
        <GameLeaderboard />
      </QueryClientProvider>
    );

    expect(await screen.findByText("Jucător 5")).toBeVisible();
    expect(screen.queryByText("Jucător 6")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+5 rezultate" }));
    expect(screen.getByText("Jucător 10")).toBeVisible();
    expect(screen.queryByText("Jucător 11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+2 rezultate" }));
    expect(screen.getByText("Jucător 12")).toBeVisible();
    expect(screen.queryByRole("button", { name: /rezultate/ })).not.toBeInTheDocument();
  });
});
