import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../db/24_game_campaigns.sql", import.meta.url),
  "utf8"
);
const editingMigration = readFileSync(
  new URL("../../../db/25_edit_game_campaigns.sql", import.meta.url),
  "utf8"
);
const persistentSessionsMigration = readFileSync(
  new URL("../../../db/27_persist_user_game_sessions.sql", import.meta.url),
  "utf8"
);

describe("timed game campaign migration", () => {
  it("keeps campaign scores separate and awards an idempotent top three", () => {
    expect(migration).toContain("create table if not exists public.game_campaign_scores");
    expect(migration).toContain("unique (campaign_id, user_id)");
    expect(migration).toContain("where ranked.rank <= 3");
    expect(migration).toContain("order by score.best_score desc, score.best_score_at asc");
    expect(migration).toContain("when 1 then v_campaign.first_prize_percent");
    expect(migration).toContain("when 2 then v_campaign.second_prize_percent");
    expect(migration).toContain("else v_campaign.third_prize_percent");
    expect(migration).toContain("on conflict (campaign_id, campaign_rank)");
    expect(migration).toContain("'pending'");
    expect(migration).toContain("revoke all on function public.save_game_campaign_score");
  });

  it("keeps the instant-record method selectable", () => {
    expect(migration).toContain("check (mode in ('campaign', 'instant_record'))");
    expect(migration).toContain("create or replace function public.set_game_reward_mode");
  });

  it("allows complete live campaign editing without rewriting finished rewards", () => {
    expect(editingMigration).toContain("create or replace function public.update_game_campaign");
    expect(editingMigration).toContain("starts_at = p_starts_at");
    expect(editingMigration).toContain("ends_at = p_ends_at");
    expect(editingMigration).toContain("first_prize_percent = p_first_prize_percent");
    expect(editingMigration).toContain("maximum_discount = p_maximum_discount");
    expect(editingMigration).toContain("validity_days = p_validity_days");
    expect(editingMigration).toContain("v_campaign.status in ('finished', 'cancelled')");
    expect(editingMigration).toContain("perform public.finalize_game_campaign");
    expect(editingMigration).toContain("revoke all on function public.update_game_campaign");
  });

  it("stores the persistent game session with campaign scores", () => {
    expect(persistentSessionsMigration).toContain("add column if not exists session_key text");
    expect(persistentSessionsMigration).toContain("p_session_key text");
    expect(persistentSessionsMigration).toContain("set session_key = excluded.session_key");
    expect(persistentSessionsMigration).toContain("'sessionId', v_saved.session_key");
    expect(persistentSessionsMigration).toContain(
      "grant execute on function public.save_game_campaign_score"
    );
  });
});
