import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeGameScoreSaveResult } from "./vouchers.service.js";

const migrationSql = readFileSync(new URL("../../../db/14_vouchers.sql", import.meta.url), "utf8");
const securityMigrationSql = readFileSync(new URL("../../../db/15_game_voucher_manual_approval.sql", import.meta.url), "utf8");
const voucherCodeRepairSql = readFileSync(new URL("../../../db/23_fix_voucher_code_generation.sql", import.meta.url), "utf8");

describe("game record reward integration contract", () => {
  it("does not expose or issue a reward for tied scores", () => {
    expect(serializeGameScoreSaveResult({
      bestScore: 100,
      playerName: "SAM",
      isNewGlobalRecord: false,
      reward: null
    })).toEqual({
      bestScore: 100,
      playerName: "SAM",
      isNewGlobalRecord: false,
      reward: undefined
    });
  });

  it("does not expose the code for a pending record reward", () => {
    expect(serializeGameScoreSaveResult({
      bestScore: 123,
      playerName: "SAM",
      isNewGlobalRecord: true,
      reward: {
        status: "pending",
        code: "RECORD-AB12CD34",
        discountType: "percentage",
        discountValue: 15,
        maximumDiscount: 20,
        minimumSubtotal: 50,
        expiresAt: "2026-08-01T00:00:00.000Z",
        message: "Felicitări!"
      }
    })).toMatchObject({
      bestScore: 123,
      playerName: "SAM",
      isNewGlobalRecord: true,
      reward: {
        status: "pending",
        code: undefined,
        discountType: "percentage",
        discountValue: 15
      }
    });
  });

  it("returns the session saved alongside the authenticated score", () => {
    expect(serializeGameScoreSaveResult({
      bestScore: 77,
      playerName: "SAM",
      sessionId: "game-session-user-1",
      isNewGlobalRecord: false,
      reward: null
    })).toMatchObject({
      bestScore: 77,
      playerName: "SAM",
      sessionId: "game-session-user-1"
    });
  });

  it("keeps game-record reward issuance atomic and idempotent in SQL", () => {
    expect(migrationSql).toContain("pg_advisory_xact_lock");
    expect(migrationSql).toContain("v_is_new_global_record := p_score > v_previous_record_score");
    expect(migrationSql).toContain("idx_vouchers_game_record_event");
    expect(migrationSql).toContain("do nothing");
  });

  it("forces every browser-originated game reward through manual approval", () => {
    expect(migrationSql).toContain("v_status := 'pending'");
    expect(migrationSql).toContain("voucher_rules_game_record_requires_approval");
    expect(securityMigrationSql).toContain("set requires_approval = true");
    expect(securityMigrationSql).toContain("set status = 'pending'");
    expect(securityMigrationSql).toContain("approved_by_user_id is null");
  });

  it("generates voucher codes without relying on Supabase's extension schema", () => {
    expect(migrationSql).toContain("pg_catalog.gen_random_uuid()");
    expect(migrationSql).not.toContain("gen_random_bytes");
    expect(voucherCodeRepairSql).toContain("pg_catalog.gen_random_uuid()");
    expect(voucherCodeRepairSql).not.toContain("gen_random_bytes(6)");
  });
});
