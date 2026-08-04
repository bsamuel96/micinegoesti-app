import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { VoucherReward } from "../api/types";
import { getGameSessionId } from "../lib/browserSession";

type GrillRunnerGameProps = {
  title?: string;
  subtitle?: string;
  showHomeButton?: boolean;
  onScoreSaved?: () => void;
};

const SESSION_SCORE_KEY = "mdn_gw_session_score";
export const SESSION_SCORE_TTL_MS = 15 * 60 * 1000;
const BASE_SPEED = 190;
const MAX_SPEED = 520;
type ScoreSaveState = "idle" | "saving" | "saved" | "error";
type RememberedScore = {
  score: number;
  expiresAt: number;
};

export function scoreSaveErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const details = error.details && typeof error.details === "object"
      ? error.details as { code?: unknown; message?: unknown }
      : null;
    const code = typeof details?.code === "string" ? details.code : "";
    const detailMessage = typeof details?.message === "string" ? details.message : "";

    if (code === "23502" && detailMessage.includes("session_key")) {
      return "Baza de date nu permite încă salvarea scorului în cont (cod 23502: session_key).";
    }

    if (code === "42P10") {
      return "Lipsește indexul unic necesar salvării scorului (cod 42P10).";
    }

    if (error.message.trim()) {
      return code ? `${error.message} Cod eroare: ${code}.` : error.message;
    }
  }

  return "Nu ne-am putut conecta la server. Verifică internetul și încearcă din nou.";
}

export function rememberedSessionScore(now = Date.now()) {
  if (typeof window === "undefined") return null;

  try {
    const rawScore = sessionStorage.getItem(SESSION_SCORE_KEY);
    if (!rawScore) return null;

    const remembered = JSON.parse(rawScore) as Partial<RememberedScore>;
    const score = Math.floor(Number(remembered.score));
    const expiresAt = Number(remembered.expiresAt);
    if (!Number.isFinite(score) || score <= 0 || !Number.isFinite(expiresAt) || expiresAt <= now) {
      forgetSessionScore();
      return null;
    }

    return score;
  } catch {
    forgetSessionScore();
    return null;
  }
}

export function rememberSessionScore(score: number, now = Date.now()) {
  const rememberedScore = Math.floor(score);

  if (!Number.isFinite(rememberedScore) || rememberedScore <= 0) {
    forgetSessionScore();
    return null;
  }

  try {
    sessionStorage.setItem(
      SESSION_SCORE_KEY,
      JSON.stringify({
        score: rememberedScore,
        expiresAt: now + SESSION_SCORE_TTL_MS
      } satisfies RememberedScore)
    );
  } catch {
    // The score still remains available in component state.
  }

  return rememberedScore;
}

export function forgetSessionScore() {
  try {
    sessionStorage.removeItem(SESSION_SCORE_KEY);
  } catch {
    // Storage can be unavailable in strict privacy modes.
  }
}

export function GrillRunnerGame({
  title = "Ești offline",
  subtitle = "Poți juca până revine conexiunea.",
  showHomeButton = true,
  onScoreSaved
}: GrillRunnerGameProps) {
  const { user } = useAuth();
  const location = useLocation();
  const widgetRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scoreRef = useRef<HTMLElement | null>(null);
  const bestRef = useRef<HTMLElement | null>(null);
  const pauseButtonRef = useRef<HTMLButtonElement | null>(null);
  const restartButtonRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayTitleRef = useRef<HTMLDivElement | null>(null);
  const overlayTextRef = useRef<HTMLDivElement | null>(null);
  const playButtonRef = useRef<HTMLButtonElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const onScoreSavedRef = useRef(onScoreSaved);
  const gameSessionId = useMemo(() => getGameSessionId(user?.id), [user?.id]);
  const scoreDialogOpenRef = useRef(false);
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [bestDisplay, setBestDisplay] = useState(0);
  const [pauseLabel, setPauseLabel] = useState("Play");
  const [pendingScore, setPendingScore] = useState<number | null>(rememberedSessionScore);
  const [scoreSaveState, setScoreSaveState] = useState<ScoreSaveState>("idle");
  const [scoreSaveError, setScoreSaveError] = useState("");
  const [scoreSaveErrorStatus, setScoreSaveErrorStatus] = useState<number | null>(null);
  const [scoreReward, setScoreReward] = useState<VoucherReward | null>(null);

  useEffect(() => {
    onScoreSavedRef.current = onScoreSaved;
  }, [onScoreSaved]);

  useEffect(() => {
    scoreDialogOpenRef.current = pendingScore !== null;
  }, [pendingScore]);

  function dismissScoreDialog() {
    forgetSessionScore();
    setPendingScore(null);
    setScoreReward(null);
    setScoreSaveState("idle");
    setScoreSaveError("");
    setScoreSaveErrorStatus(null);
  }

  useEffect(() => {
    if (pendingScore === null || scoreSaveState === "saving") return;

    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissScoreDialog();
    };
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [pendingScore, scoreSaveState]);

  async function handleScoreSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingScore === null || scoreSaveState === "saving") return;

    setScoreSaveState("saving");
    setScoreSaveError("");
    setScoreSaveErrorStatus(null);

    try {
      const response = await api.saveGameScore(gameSessionId, pendingScore);
      forgetSessionScore();
      setBestDisplay(response.bestScore);
      setScoreReward(response.reward ?? null);
      if (bestRef.current) bestRef.current.textContent = String(response.bestScore);
      setScoreSaveState("saved");
      onScoreSavedRef.current?.();
      if (!response.reward) {
        window.setTimeout(() => {
          setPendingScore(null);
          setScoreSaveState("idle");
        }, 650);
      }
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(
          `[game-score:save-failed] ${JSON.stringify({
            status: error.status,
            message: error.message,
            details: error.details
          })}`
        );
      } else {
        console.error("[game-score:save-failed]", error);
      }
      setScoreSaveState("error");
      setScoreSaveError(scoreSaveErrorMessage(error));
      setScoreSaveErrorStatus(error instanceof ApiError ? error.status : null);
    }
  }

  useEffect(() => {
    if (
      !widgetRef.current ||
      !canvasRef.current ||
      !scoreRef.current ||
      !bestRef.current ||
      !pauseButtonRef.current ||
      !restartButtonRef.current ||
      !overlayRef.current ||
      !overlayTitleRef.current ||
      !overlayTextRef.current ||
      !playButtonRef.current ||
      !hintRef.current
    ) {
      return;
    }

    const widgetEl = widgetRef.current!;
    const canvas = canvasRef.current!;
    const scoreEl = scoreRef.current!;
    const bestEl = bestRef.current!;
    const btnPause = pauseButtonRef.current!;
    const btnRestart = restartButtonRef.current!;
    const overlayEl = overlayRef.current!;
    const overlayTitleEl = overlayTitleRef.current!;
    const overlayTextEl = overlayTextRef.current!;
    const playBtn = playButtonRef.current!;
    const hintEl = hintRef.current!;

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    let W = 320;
    let H = 300;
    let dpr = 1;

    let raf = 0;
    let running = true;
    let paused = true;
    let started = false;
    let gameOver = false;
    let tPrev = 0;
    let score = 0;
    let best = 0;
    let lastPulseScore = 0;
    const sessionId = gameSessionId;
    const fxTimeouts: number[] = [];
    bestEl.textContent = String(best);
    setBestDisplay(best);

    let jumpCount = 0;
    let flipActive = false;
    let time = 0;
    let gameTime = 0;

    let flipPattern = [1, 3, 4, 6, 7, 9];

    const runner = {
      x: 60,
      y: 0,
      vy: 0,
      r: 16,
      onGround: true,
      jumpPower: 520,
      rot: 0,
      rotV: 0,
      bob: 0
    };

    type Hazard = {
      type: string;
      lane: "ground" | "overhead";
      x: number;
      y: number;
      w: number;
      h: number;
      sway: number;
    };

    type Smoke = {
      x: number;
      y: number;
      r: number;
      alpha: number;
      drift: number;
      phase: number;
    };

    const world = {
      groundY: 0,
      speed: BASE_SPEED,
      gravity: 1600,
      nextSpawn: 0,
      obstacles: [] as Hazard[],
      smoke: [] as Smoke[]
    };

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(280, Math.floor(r.width));
      H = Math.max(240, Math.floor(r.height));
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function rand(a: number, b: number) {
      return a + Math.random() * (b - a);
    }

    function resetSmokeParticle(particle: Smoke, x = rand(0, W)) {
      particle.x = x;
      particle.y = rand(H * 0.18, world.groundY - 28);
      particle.r = rand(18, 54);
      particle.alpha = rand(0.06, 0.17);
      particle.drift = rand(8, 22);
      particle.phase = rand(0, Math.PI * 2);
    }

    function seedSmoke() {
      const count = Math.max(9, Math.round(W / 60));
      while (world.smoke.length < count) {
        world.smoke.push({ x: 0, y: 0, r: 0, alpha: 0, drift: 0, phase: 0 });
      }
      world.smoke.length = count;
      world.smoke.forEach((particle) => resetSmokeParticle(particle));
    }

    function randomizeFlipPattern() {
      const indices = Array.from({ length: 10 }, (_, i) => i + 1);
      for (let i = indices.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      flipPattern = indices.slice(0, 6).sort((a, b) => a - b);
    }

    function setHint(text: string, opacity = "1", transform = "translateX(-50%) translateY(0)") {
      hintEl.textContent = text;
      hintEl.style.opacity = opacity;
      hintEl.style.transform = transform;
    }

    function setBestScore(nextBest: number) {
      best = Math.max(best, Math.floor(nextBest));
      bestEl.textContent = String(best);
      setBestDisplay(best);
    }

    function triggerFxClass(el: HTMLElement | null, className: string, duration = 220) {
      if (!el) return;
      el.classList.remove(className);
      void el.offsetWidth;
      el.classList.add(className);
      const timeoutId = window.setTimeout(() => {
        el.classList.remove(className);
      }, duration);
      fxTimeouts.push(timeoutId);
    }

    function promptScoreSave(nextScore: number) {
      setPendingScore(rememberSessionScore(nextScore));
      setScoreSaveState("idle");
      setScoreSaveError("");
      setScoreSaveErrorStatus(null);
      setScoreReward(null);
    }

    api
      .gameScore(sessionId)
      .then((response) => {
        setBestScore(response.bestScore);
        localStorage.removeItem("mdn_gw_best");
      })
      .catch(() => null);

    function showOverlay(mode: "start" | "pause" | "over", overlayTitle: string, overlayText: string, buttonText = "Play") {
      overlayEl.className = "mdnGW_overlay is-visible";
      if (mode === "start") overlayEl.classList.add("is-start");
      if (mode === "pause") overlayEl.classList.add("is-pause");
      if (mode === "over") overlayEl.classList.add("is-over");
      overlayTitleEl.textContent = overlayTitle;
      overlayTextEl.textContent = overlayText;
      playBtn.textContent = buttonText;
    }

    function hideOverlay() {
      overlayEl.className = "mdnGW_overlay";
    }

    function setGround() {
      world.groundY = Math.floor(H * 0.78);
      runner.y = world.groundY - runner.r;
    }

    function reset() {
      score = 0;
      gameTime = 0;
      lastPulseScore = 0;
      scoreEl.textContent = "0";
      setScoreDisplay(0);
      world.speed = BASE_SPEED;
      world.obstacles.length = 0;
      seedSmoke();
      world.nextSpawn = rand(0.8, 1.4);
      runner.vy = 0;
      runner.onGround = true;
      runner.y = world.groundY - runner.r;
      runner.rot = 0;
      runner.rotV = 0;
      runner.bob = 0;
      flipActive = false;

      jumpCount = 0;
      randomizeFlipPattern();

      started = false;
      gameOver = false;

      if (paused) {
        showOverlay("start", title, subtitle, "Play");
      } else {
        hideOverlay();
      }

      setHint(paused ? "Apasă Play sau tap pentru start" : "Tap pentru salt");
    }

    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function startGame() {
      if (!paused) return;
      paused = false;
      started = true;
      btnPause.textContent = "Pauză";
      setPauseLabel("Pauză");
      hideOverlay();
      setHint("Tap pentru salt", "0");
    }

    function jump() {
      if (!running) return;

      if (paused) {
        if (gameOver) return;
        startGame();
        return;
      }

      if (!runner.onGround) return;

      runner.onGround = false;
      runner.vy = -runner.jumpPower;

      jumpCount += 1;
      if (flipPattern.includes(jumpCount)) {
        flipActive = true;
        runner.rotV = 12.0;
      } else {
        flipActive = false;
        runner.rotV = 0;
        runner.rot = 0;
      }

      if (jumpCount >= 10) jumpCount = 0;

      setHint("", "0", "translateX(-50%) translateY(6px)");
    }

    const TYPES = ["bread", "mustard", "beer", "chicken"];
    const OVERHEAD_TYPES = ["pan", "hook", "coal"];

    function spawnObstacle() {
      const canSpawnOverhead = score > 12;
      const spawnOverhead = canSpawnOverhead && Math.random() < Math.min(0.42, 0.18 + score / 420);
      const type = spawnOverhead
        ? OVERHEAD_TYPES[Math.floor(Math.random() * OVERHEAD_TYPES.length)]
        : TYPES[Math.floor(Math.random() * TYPES.length)];
      const size = spawnOverhead ? rand(30, 42) : type === "beer" ? rand(28, 36) : rand(26, 34);
      const overheadY = world.groundY - rand(102, 134);
      world.obstacles.push({
        type,
        lane: spawnOverhead ? "overhead" : "ground",
        x: W + 40,
        y: spawnOverhead ? overheadY : world.groundY - size,
        w: size,
        h: spawnOverhead ? size * 0.72 : size,
        sway: rand(0, Math.PI * 2)
      });
    }

    function collideCircleRect(c: { x: number; y: number; r: number }, r: { x: number; y: number; w: number; h: number }) {
      const nx = Math.max(r.x, Math.min(c.x, r.x + r.w));
      const ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
      const dx = c.x - nx;
      const dy = c.y - ny;
      return dx * dx + dy * dy <= c.r * c.r * 0.86;
    }

    function softShadow(x: number, y: number, w: number, h: number) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.52, y + h + 9, w * 0.52, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawRunner() {
      const x = runner.x;
      const bobY = runner.bob;
      const y = runner.y + bobY;
      const r = runner.r;

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(x + 3, world.groundY + 8, r * 1.15, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(runner.rot);

      const w = r * 2.5;
      const h = r * 1.12;
      const bx = -w / 2;
      const by = -h / 2;

      const g = ctx.createLinearGradient(bx, by, bx + w, by + h);
      g.addColorStop(0, "#6a311d");
      g.addColorStop(0.4, "#8c4426");
      g.addColorStop(0.7, "#7a341f");
      g.addColorStop(1, "#4f2115");
      ctx.fillStyle = g;
      roundRect(bx, by, w, h, 999);
      ctx.fill();

      ctx.strokeStyle = "rgba(35,15,9,.34)";
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 4; i += 1) {
        const xx = bx + ((i + 1) * w) / 5;
        ctx.beginPath();
        ctx.moveTo(xx + 2, by + 4);
        ctx.lineTo(xx - 6, by + h - 4);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255,255,255,.18)";
      roundRect(bx + 4, by + 3, w * 0.55, h * 0.34, 999);
      ctx.fill();

      ctx.restore();
    }

    function drawBread(x: number, y: number, w: number, h: number) {
      softShadow(x, y, w, h);

      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "#f7ddb7");
      g.addColorStop(0.55, "#ebb97d");
      g.addColorStop(1, "#d79859");
      ctx.fillStyle = g;
      roundRect(x + w * 0.04, y + h * 0.08, w * 0.92, h * 0.84, 14);
      ctx.fill();

      ctx.strokeStyle = "rgba(118,68,28,.24)";
      ctx.lineWidth = 1.8;
      roundRect(x + w * 0.04, y + h * 0.08, w * 0.92, h * 0.84, 14);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,.26)";
      roundRect(x + w * 0.11, y + h * 0.14, w * 0.52, h * 0.22, 999);
      ctx.fill();

      ctx.strokeStyle = "rgba(130,80,30,.18)";
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 2; i += 1) {
        const xx = x + w * (0.38 + i * 0.2);
        ctx.beginPath();
        ctx.moveTo(xx, y + h * 0.2);
        ctx.lineTo(xx, y + h * 0.8);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(190,125,58,.18)";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, y + h * 0.7, w * 0.22, h * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawMustard(x: number, y: number, w: number, h: number) {
      softShadow(x, y, w, h);

      const bodyX = x + w * 0.28;
      const bodyY = y + h * 0.16;
      const bodyW = w * 0.44;
      const bodyH = h * 0.7;

      const g = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyW, bodyY + bodyH);
      g.addColorStop(0, "#ffe072");
      g.addColorStop(0.55, "#f5a000");
      g.addColorStop(1, "#df8600");

      ctx.fillStyle = g;
      roundRect(bodyX, bodyY, bodyW, bodyH, 12);
      ctx.fill();

      ctx.fillStyle = "#191919";
      roundRect(x + w * 0.34, y + h * 0.05, w * 0.32, h * 0.16, 8);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,.92)";
      roundRect(x + w * 0.32, y + h * 0.43, w * 0.36, h * 0.2, 8);
      ctx.fill();

      ctx.fillStyle = "#f2d24f";
      roundRect(x + w * 0.35, y + h * 0.49, w * 0.3, h * 0.05, 999);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,.20)";
      roundRect(x + w * 0.34, y + h * 0.18, w * 0.08, h * 0.58, 999);
      ctx.fill();
    }

    function drawBeer(x: number, y: number, w: number, h: number) {
      softShadow(x, y, w, h);

      const glassX = x + w * 0.16;
      const glassY = y + h * 0.16;
      const glassW = w * 0.46;
      const glassH = h * 0.7;

      ctx.fillStyle = "rgba(255,255,255,.80)";
      roundRect(glassX, glassY, glassW, glassH, 10);
      ctx.fill();

      const beer = ctx.createLinearGradient(glassX, glassY + h * 0.14, glassX, glassY + glassH);
      beer.addColorStop(0, "rgba(255,215,90,.72)");
      beer.addColorStop(1, "rgba(241,155,0,.92)");
      ctx.fillStyle = beer;
      roundRect(glassX + w * 0.03, glassY + h * 0.14, glassW - w * 0.06, glassH - h * 0.16, 8);
      ctx.fill();

      ctx.fillStyle = "#fff";
      roundRect(x + w * 0.16, y + h * 0.1, w * 0.5, h * 0.17, 12);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x + w * 0.71, y + h * 0.53, w * 0.14, -Math.PI / 2, Math.PI / 2);
      ctx.arc(x + w * 0.71, y + h * 0.53, w * 0.08, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,.80)";
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,.18)";
      roundRect(glassX + w * 0.03, glassY + h * 0.06, w * 0.06, glassH - h * 0.1, 999);
      ctx.fill();
    }

    function drawChicken(x: number, y: number, w: number, h: number) {
      softShadow(x, y, w, h);

      const meat = ctx.createLinearGradient(x, y, x + w, y + h);
      meat.addColorStop(0, "#f0a863");
      meat.addColorStop(0.55, "#d37d31");
      meat.addColorStop(1, "#ac581f");

      ctx.fillStyle = meat;
      ctx.beginPath();
      ctx.ellipse(x + w * 0.6, y + h * 0.56, w * 0.29, h * 0.23, -0.32, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(92,42,15,.18)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(x + w * 0.6, y + h * 0.56, w * 0.29, h * 0.23, -0.32, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.49, y + h * 0.43);
      ctx.lineTo(x + w * 0.7, y + h * 0.6);
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.28, y + h * 0.58, w * 0.12, h * 0.1, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.2, y + h * 0.48, w * 0.1, h * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,.16)";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.66, y + h * 0.48, w * 0.11, h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawPan(x: number, y: number, w: number, h: number) {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = "rgba(30,24,20,.6)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w * 0.52, -22);
      ctx.lineTo(w * 0.52, h * 0.18);
      ctx.stroke();

      const metal = ctx.createLinearGradient(0, 0, w, h);
      metal.addColorStop(0, "#3b3d42");
      metal.addColorStop(0.55, "#17191d");
      metal.addColorStop(1, "#575b63");
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.ellipse(w * 0.46, h * 0.52, w * 0.35, h * 0.34, -0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#101114";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.74, h * 0.38);
      ctx.lineTo(w * 1.08, h * 0.2);
      ctx.stroke();
      ctx.restore();
    }

    function drawHook(x: number, y: number, w: number, h: number) {
      ctx.save();
      ctx.strokeStyle = "rgba(28,21,17,.68)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y - 28);
      ctx.lineTo(x + w * 0.5, y + h * 0.36);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x + w * 0.5, y + h * 0.48, w * 0.28, -Math.PI * 0.55, Math.PI * 0.9);
      ctx.stroke();

      ctx.fillStyle = "#bf3e24";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.54, y + h * 0.38, w * 0.18, h * 0.24, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawCoal(x: number, y: number, w: number, h: number) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = "#1c1714";
      roundRect(0, h * 0.12, w * 0.76, h * 0.68, 8);
      ctx.fill();

      ctx.fillStyle = "rgba(239,90,34,.82)";
      ctx.beginPath();
      ctx.ellipse(w * 0.28, h * 0.44, w * 0.14, h * 0.12, 0.2, 0, Math.PI * 2);
      ctx.ellipse(w * 0.52, h * 0.52, w * 0.11, h * 0.1, -0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ffb13c";
      ctx.beginPath();
      ctx.ellipse(w * 0.4, h * 0.45, w * 0.52, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawObstacle(o: Hazard) {
      if (o.lane === "overhead") {
        const y = o.y + Math.sin(time * 2.6 + o.sway) * 3;
        if (o.type === "pan") return drawPan(o.x, y, o.w, o.h);
        if (o.type === "hook") return drawHook(o.x, y, o.w, o.h);
        return drawCoal(o.x, y, o.w, o.h);
      }
      if (o.type === "bread") return drawBread(o.x, o.y, o.w, o.h);
      if (o.type === "mustard") return drawMustard(o.x, o.y, o.w, o.h);
      if (o.type === "beer") return drawBeer(o.x, o.y, o.w, o.h);
      return drawChicken(o.x, o.y, o.w, o.h);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      const panelTop = 16;
      const panelBottom = world.groundY - 18;
      const cookedScene = Math.floor(score / 50) % 2 === 1;

      const background = ctx.createLinearGradient(0, 0, 0, H);
      if (cookedScene) {
        background.addColorStop(0, "#2b1710");
        background.addColorStop(0.54, "#140e0c");
        background.addColorStop(1, "#080706");
      } else {
        background.addColorStop(0, "#ffffff");
        background.addColorStop(1, "#f7f7f8");
      }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = cookedScene ? "rgba(255,180,74,.08)" : "rgba(0,0,0,.045)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 10; i += 1) {
        const xx = 22 + (i * (W - 44)) / 9;
        ctx.beginPath();
        ctx.moveTo(xx, panelTop);
        ctx.lineTo(xx, panelBottom);
        ctx.stroke();
      }

      const haze = ctx.createLinearGradient(0, 0, W, 0);
      haze.addColorStop(0, cookedScene ? "rgba(255,120,35,.16)" : "rgba(245,160,0,.03)");
      haze.addColorStop(0.5, "rgba(255,255,255,0)");
      haze.addColorStop(1, cookedScene ? "rgba(255,68,24,.2)" : "rgba(214,40,40,.03)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, world.groundY);

      for (const particle of world.smoke) {
        const smokeGlow = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.r);
        smokeGlow.addColorStop(0, cookedScene ? `rgba(220,210,195,${particle.alpha})` : `rgba(120,120,120,${particle.alpha * 0.55})`);
        smokeGlow.addColorStop(1, "rgba(120,120,120,0)");
        ctx.fillStyle = smokeGlow;
        ctx.beginPath();
        ctx.ellipse(
          particle.x,
          particle.y,
          particle.r * 1.25,
          particle.r * 0.58,
          Math.sin(time + particle.phase) * 0.18,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.fillStyle = cookedScene ? "rgba(0,0,0,.42)" : "rgba(0,0,0,.055)";
      ctx.fillRect(0, world.groundY, W, H - world.groundY);

      const grad = ctx.createLinearGradient(0, world.groundY - 2, 0, world.groundY + 18);
      grad.addColorStop(0, cookedScene ? "rgba(255,93,28,.55)" : "rgba(245,160,0,.25)");
      grad.addColorStop(1, "rgba(214,40,40,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, world.groundY - 2, W, 20);

      if (cookedScene) {
        ctx.fillStyle = "rgba(255,122,35,.18)";
        for (let i = 0; i < 18; i += 1) {
          const emberX = (i * 61 + time * 34) % (W + 80) - 40;
          const emberY = world.groundY - 16 - ((i * 29 + time * 23) % 110);
          ctx.beginPath();
          ctx.arc(emberX, emberY, 1.2 + (i % 3) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const o of world.obstacles) drawObstacle(o);
      drawRunner();
    }

    function update(dt: number) {
      time += dt;

      if (runner.onGround) {
        const freq = paused ? 3.4 : 8.5;
        const amp = paused ? 1.8 : 2.4;
        runner.bob = Math.sin(time * freq) * amp;
      } else {
        runner.bob = 0;
      }

      if (!running || paused) return;

      gameTime += dt;
      world.speed = Math.min(MAX_SPEED, BASE_SPEED + score * 2.25 + gameTime * 1.6);

      for (const particle of world.smoke) {
        particle.x -= (world.speed * 0.035 + particle.drift) * dt;
        particle.y -= (7 + world.speed * 0.018) * dt;
        particle.phase += dt * 0.8;
        if (particle.x + particle.r < -50 || particle.y + particle.r < 18) {
          resetSmokeParticle(particle, W + rand(20, 140));
        }
      }

      runner.vy += world.gravity * dt;
      runner.y += runner.vy * dt;

      if (!runner.onGround && flipActive) runner.rot += runner.rotV * dt;

      if (runner.y >= world.groundY - runner.r) {
        runner.y = world.groundY - runner.r;
        runner.vy = 0;
        runner.onGround = true;
        runner.rot = 0;
        runner.rotV = 0;
        flipActive = false;
      }

      world.nextSpawn -= dt;
      if (world.nextSpawn <= 0) {
        spawnObstacle();
        const k = Math.max(0.48, 1.15 - (world.speed - BASE_SPEED) / 560);
        world.nextSpawn = rand(0.72 * k, 1.28 * k);
      }

      for (let i = world.obstacles.length - 1; i >= 0; i -= 1) {
        const o = world.obstacles[i];
        o.x -= world.speed * dt;

        if (o.x + o.w < -80) {
          world.obstacles.splice(i, 1);
          continue;
        }

        const hitbox = o.lane === "overhead" ? { ...o, y: o.y + Math.sin(time * 2.6 + o.sway) * 3 } : o;

        if (collideCircleRect(runner, hitbox)) {
          triggerFxClass(gameWrap as HTMLElement | null, "is-hit", 280);
          triggerFxClass(widgetEl, "is-hit-shake", 320);
          promptScoreSave(score);

          paused = true;
          started = false;
          gameOver = true;
          btnPause.textContent = "Play";
          setPauseLabel("Play");

          showOverlay("over", "Ai pierdut", `Scorul tău a fost ${Math.floor(score)}. Mai încerci o dată?`, "Restart");
          setHint("Ai pierdut", "1");
          return;
        }
      }

      score += dt * (world.speed / 170);
      const floor = Math.floor(score);
      if (floor > lastPulseScore && floor % 3 === 0) {
        triggerFxClass(scoreEl, "is-bump", 180);
        lastPulseScore = floor;
      }
      scoreEl.textContent = String(floor);
      setScoreDisplay(floor);
    }

    function now() {
      return performance && performance.now ? performance.now() : Date.now();
    }

    function loop(t: number) {
      const tt = t || now();
      const dt = Math.min(0.033, (tt - tPrev) / 1000 || 0.016);
      tPrev = tt;

      update(dt);
      draw();

      raf = requestAnimationFrame(loop);
    }

    function onPress(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a")) return;
      if (e.cancelable) e.preventDefault();
      jump();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (![" ", "Space", "Spacebar"].includes(e.key) && e.code !== "Space") return;
      if (scoreDialogOpenRef.current) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      if (e.cancelable) e.preventDefault();
      jump();
    }

    const gameWrap = canvas.parentElement;
    gameWrap?.addEventListener("touchstart", onPress, { passive: false });
    gameWrap?.addEventListener("mousedown", onPress);
    window.addEventListener("keydown", onKeyDown);

    const onPauseClick = () => {
      if (!started || gameOver) return;

      paused = !paused;
      btnPause.textContent = paused ? "Play" : "Pauză";
      setPauseLabel(paused ? "Play" : "Pauză");

      if (paused) {
        showOverlay("pause", "Pauză", "Jocul este oprit momentan.", "Continuă");
        setHint("Pauză", "1");
      } else {
        hideOverlay();
        setHint("Tap pentru salt", "0");
      }
    };

    const onRestartClick = () => {
      paused = true;
      btnPause.textContent = "Play";
      setPauseLabel("Play");
      resetGameStateAfterLoss();
      reset();
    };

    const onPlayClick = () => {
      if (overlayEl.classList.contains("is-over")) {
        paused = true;
        btnPause.textContent = "Play";
        setPauseLabel("Play");
        resetGameStateAfterLoss();
        reset();
        return;
      }

      startGame();
    };

    btnPause.addEventListener("click", onPauseClick);
    btnRestart.addEventListener("click", onRestartClick);
    playBtn.addEventListener("click", onPlayClick);

    resize();
    setGround();
    btnPause.textContent = "Play";
    setPauseLabel("Play");
    reset();

    function resetGameStateAfterLoss() {
      world.speed = BASE_SPEED;
      world.obstacles.length = 0;
      seedSmoke();
      world.nextSpawn = rand(0.8, 1.4);
      runner.vy = 0;
      runner.onGround = true;
      runner.y = world.groundY - runner.r;
      runner.rot = 0;
      runner.rotV = 0;
      runner.bob = 0;
      flipActive = false;
      jumpCount = 0;
      randomizeFlipPattern();
      score = 0;
      gameTime = 0;
      lastPulseScore = 0;
      scoreEl.textContent = "0";
      setScoreDisplay(0);
    }

    tPrev = now();
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      resize();
      setGround();
      seedSmoke();
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      btnPause.removeEventListener("click", onPauseClick);
      btnRestart.removeEventListener("click", onRestartClick);
      playBtn.removeEventListener("click", onPlayClick);
      gameWrap?.removeEventListener("touchstart", onPress as EventListener);
      gameWrap?.removeEventListener("mousedown", onPress as EventListener);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      for (const timeoutId of fxTimeouts) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [title, subtitle, gameSessionId]);

  const isScoreSaving = scoreSaveState === "saving";
  const isScoreSaved = scoreSaveState === "saved";
  const hasAccount = Boolean(user);
  const needsAccount = !hasAccount || scoreSaveErrorStatus === 401;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const loginPath = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  const registerPath = `/register?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <section ref={widgetRef} id="mdnGrillWidget" className="mdnGW" aria-label="MDN Grill Runner">
      <div className="mdnGW_top">
        <div className="mdnGW_status">
          <div className="mdnGW_dot" />
          <div>
            <div className="mdnGW_title">{title}</div>
            <div className="mdnGW_sub">{subtitle}</div>
          </div>
        </div>

        <div className="mdnGW_actions">
          <button type="button" className="mdnGW_btn" id="mdnGW_pause" ref={pauseButtonRef}>
            {pauseLabel}
          </button>
          <button type="button" className="mdnGW_btn" id="mdnGW_restart" ref={restartButtonRef}>
            Restart
          </button>

          {showHomeButton && (
            <a className="mdnGW_btn mdnGW_home" href="/" id="mdnGW_home">
              Acasă
            </a>
          )}
        </div>
      </div>

      <div className="mdnGW_game">
        <canvas id="mdnGW_canvas" ref={canvasRef} />

        <div className="mdnGW_overlay" id="mdnGW_overlay" ref={overlayRef}>
          <div className="mdnGW_overlayCard">
            <div className="mdnGW_overlayTitle" id="mdnGW_overlayTitle" ref={overlayTitleRef}>
              {title}
            </div>
            <div className="mdnGW_overlayText" id="mdnGW_overlayText" ref={overlayTextRef}>
              {subtitle}
            </div>
            <button type="button" className="mdnGW_overlayBtn" id="mdnGW_play" ref={playButtonRef}>
              Play
            </button>
          </div>
        </div>

        <div className="mdnGW_hint" ref={hintRef}>
          Tap pentru salt
        </div>
      </div>

      <div className="mdnGW_bottom">
        <div className="mdnGW_score">
          <span>Scor:</span> <b id="mdnGW_score" ref={scoreRef}>{scoreDisplay}</b>
          <span className="mdnGW_sep">•</span>
          <span>Record:</span> <b id="mdnGW_best" ref={bestRef}>{bestDisplay}</b>
        </div>
      </div>

      {pendingScore !== null && (
        <div
          className="mdnGW_scoreDialogBackdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isScoreSaving) dismissScoreDialog();
          }}
        >
          <form className="mdnGW_scoreDialog" role="dialog" aria-modal="true" aria-labelledby="mdnGW_scoreDialogTitle" onSubmit={handleScoreSave}>
            <div className="mdnGW_scoreDialogKicker">Scor final</div>
            <div className="mdnGW_scoreDialogTitle" id="mdnGW_scoreDialogTitle">
              {pendingScore}
            </div>
            <p className="mdnGW_scoreDialogHint">
              {needsAccount
                ? "Scorul rămâne păstrat în această sesiune. Creează un cont sau autentifică-te pentru a-l salva."
                : "Numele din clasament este preluat automat din contul tău."}
            </p>
            {(scoreSaveError || isScoreSaved) && (
              <p className={`mdnGW_scoreDialogStatus ${isScoreSaved ? "is-saved" : ""}`} role={scoreSaveState === "error" ? "alert" : "status"}>
                {isScoreSaved ? "Scor salvat" : scoreSaveError}
              </p>
            )}
            {scoreReward && (
              <div className={`mdnGW_rewardBox is-${scoreReward.status}`}>
                <strong>{scoreReward.message}</strong>
                {scoreReward.status === "active" && scoreReward.code ? (
                  <>
                    <p>
                      Cod: <b>{scoreReward.code}</b> · Discount{" "}
                      {scoreReward.discountType === "percentage" ? `${scoreReward.discountValue}%` : `${scoreReward.discountValue.toFixed(2)} lei`}
                      {scoreReward.expiresAt ? ` · expiră ${new Date(scoreReward.expiresAt).toLocaleDateString("ro-RO")}` : ""}
                    </p>
                    <button type="button" className="mdnGW_scoreDialogGhost" onClick={() => navigator.clipboard?.writeText(scoreReward.code!)}>
                      Copiază codul
                    </button>
                  </>
                ) : (
                  <p>Administratorul va verifica recordul și va activa voucherul dacă totul este în regulă.</p>
                )}
              </div>
            )}
            <div className="mdnGW_scoreDialogActions">
              <button type="button" className="mdnGW_scoreDialogGhost" disabled={isScoreSaving} onClick={dismissScoreDialog}>
                Închide
              </button>
              {needsAccount ? (
                <>
                  <Link className="mdnGW_scoreDialogGhost mdnGW_scoreDialogLink" to={loginPath}>
                    Autentifică-te
                  </Link>
                  <Link className="mdnGW_scoreDialogPrimary mdnGW_scoreDialogLink" to={registerPath}>
                    Înregistrează-te
                  </Link>
                </>
              ) : (
                <button type="submit" className="mdnGW_scoreDialogPrimary" disabled={isScoreSaving || isScoreSaved}>
                  {isScoreSaving ? "Se salvează" : isScoreSaved ? "Salvat" : "Salvează scorul"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
