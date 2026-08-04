// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  forgetSessionScore,
  rememberedSessionScore,
  rememberSessionScore,
  SESSION_SCORE_TTL_MS,
  scoreSaveErrorMessage
} from "./GrillRunnerGame";
import { ApiError } from "../api/client";

afterEach(() => {
  sessionStorage.clear();
});

describe("GrillRunnerGame session score", () => {
  it("replaces the unsaved score with the latest completed game", () => {
    expect(rememberedSessionScore()).toBeNull();

    expect(rememberSessionScore(20, 1_000)).toBe(20);
    expect(rememberSessionScore(12, 2_000)).toBe(12);
    expect(rememberedSessionScore(2_001)).toBe(12);
  });

  it("clears the previous pending score when the latest score is zero", () => {
    rememberSessionScore(20);

    expect(rememberSessionScore(0)).toBeNull();
    expect(rememberedSessionScore()).toBeNull();
  });

  it("forgets the remembered score after it is saved", () => {
    rememberSessionScore(35);
    forgetSessionScore();

    expect(rememberedSessionScore()).toBeNull();
  });

  it("expires an unsaved score after fifteen minutes", () => {
    rememberSessionScore(35, 1_000);

    expect(rememberedSessionScore(1_000 + SESSION_SCORE_TTL_MS - 1)).toBe(35);
    expect(rememberedSessionScore(1_000 + SESSION_SCORE_TTL_MS)).toBeNull();
    expect(sessionStorage.getItem("mdn_gw_session_score")).toBeNull();
  });

  it("clears scores saved by the old unbounded storage format", () => {
    sessionStorage.setItem("mdn_gw_session_score", "35");

    expect(rememberedSessionScore()).toBeNull();
    expect(sessionStorage.getItem("mdn_gw_session_score")).toBeNull();
  });
});

describe("GrillRunnerGame score save errors", () => {
  it("explains a stale session_key database constraint", () => {
    const error = new ApiError(500, "Nu am putut salva scorul.", {
      code: "23502",
      message: 'null value in column "session_key" violates not-null constraint'
    });

    expect(scoreSaveErrorMessage(error)).toBe(
      "Baza de date nu permite încă salvarea scorului în cont (cod 23502: session_key)."
    );
  });

  it("includes an unknown database error code without exposing its raw message", () => {
    const error = new ApiError(500, "Nu am putut salva scorul.", {
      code: "23505",
      message: "sensitive database detail"
    });

    expect(scoreSaveErrorMessage(error)).toBe("Nu am putut salva scorul. Cod eroare: 23505.");
  });
});
