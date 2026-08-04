
<?php
// index.php — Mobile-first multi-step feedback form (glassmorphism + snake progress)
?><!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Feedback</title>
  <style>
:root {
  --white: #ffffff;

  /* BRAND COLORS */
  --yh-yellow: #FFD446;
  --yh-orange: #FF8906;
  --yh-red: #FF4D00;
  --yh-dark: #3A1A00;

  --bg1: var(--yh-yellow);
  --bg2: var(--yh-orange);

  --fg: var(--yh-dark);
  --muted: rgba(58,26,0,0.55);

  /* UI COLORS */
  --glass-bg: rgba(255,255,255,0.50);
  --glass-stroke: rgba(255,255,255,0.65);

  --btn: var(--yh-red);
  --btn-text: #fff;

  --accent: var(--yh-orange);
  --danger: var(--yh-red);  /* matches brand red */

  --card-max-w: 560px;
  --radius-xl: 22px;
  --radius-sm: 12px;

  --pad: clamp(16px, 4vw, 24px);
  --gap: clamp(12px, 3.5vw, 18px);

  --progress-h: 18px;
  --snake-size: 14px;
  --food-size: 10px;
}

    /* Reset-ish */
    *,*::before,*::after{ box-sizing:border-box; }
    html,body{ height:100%; }
    body{
      margin:0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Noto Sans", "Helvetica Neue", Arial, "Apple Color Emoji","Segoe UI Emoji";
      color:var(--fg);
      background:
  radial-gradient(1200px 800px at 70% -20%, rgba(255,255,255,0.25), transparent 60%),
  linear-gradient(145deg, #FFD446, #FF8906 50%, #FF4D00 130%);
      background-attachment: fixed;
    }

    .wrap{
      min-height:100svh;
      display:grid;
      place-items:center;
      padding:clamp(12px, 3vw, 24px);
    }

    .card {
  width: 100%;
  max-width: var(--card-max-w);

  /* More transparent & colder glass */
  background: rgba(255, 255, 255, 0.22); 
  backdrop-filter: blur(22px) saturate(190%);
  -webkit-backdrop-filter: blur(22px) saturate(190%);

  /* Stronger frosted border */
  border: 1px solid rgba(255, 255, 255, 0.45);

  /* Stronger depth shadow */
  box-shadow:
    0 20px 60px rgba(0,0,0,0.35),
    inset 0 0 1px rgba(255,255,255,0.4);

  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;

  /* thin inner glow to simulate polished glass */
  background-clip: padding-box;
}
.card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;

  background: linear-gradient(
    135deg,
    rgba(255,255,255,0.22) 0%,
    rgba(255,255,255,0.10) 28%,
    rgba(255,255,255,0.03) 70%,
    rgba(255,255,255,0.08) 100%
  );

  /* Subtle glass highlight */
  mix-blend-mode: screen;
}

.card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 30% 20%,
    rgba(255,255,255,0.14),
    rgba(255,255,255,0.04) 30%,
    rgba(255,255,255,0) 65%
  );
  pointer-events: none;
}
    .card-body{
      padding: calc(var(--pad) + 6px);
      padding-bottom: calc(var(--pad) + 24px + var(--progress-h)); /* leave room for progress bar */
      display:flex;
      flex-direction:column;
      gap: var(--gap);
      transition: opacity 0.35s ease;
    }

    h1,h2,h3,p,label{ margin:0; }
    h1{
      font-size:clamp(22px, 6vw, 28px);
      line-height:1.15;
      letter-spacing: -0.01em;
    }
    p, label, .hint{
      font-size:clamp(14px, 3.8vw, 16px);
      color: var(--fg);
    }
    .muted{ color: var(--muted); }

    .center{ text-align:center; }
    .row{ display:flex; gap:12px; flex-wrap:wrap; }
    .col{ display:flex; flex-direction:column; gap:10px; }

    .logo-zone{
      position: relative;
      min-height: 58svh; /* lets us place the items approx 1/3 from top within the card body */
      display:grid;
      place-items:center;
    }
    .logo{
      width:min(220px, 60vw);
      height:auto;
      display:block;
      position:absolute;
top:1%;
left:50%;
      transform:translateX(-50%);
      filter: drop-shadow(0 6px 18px rgba(0,0,0,0.25));
    }
    .character{
      width:min(280px, 78vw);
      height:auto;
      position:absolute;
      top:33%;
      left:50%;
      transform:translateX(-50%);
      pointer-events:none;
      user-select:none;
    }

    .btn{
      appearance:none;
      border: none;
      background: var(--btn);
      color: var(--btn-text);
      padding: 14px 18px;
      border-radius: 14px;
      font-weight: 700;
      font-size: clamp(15px, 4.2vw, 16px);
      line-height:1;
      cursor:pointer;
      transition: transform .06s ease, opacity .2s ease;
      touch-action: manipulation;
    }
    .btn:active{ transform: translateY(1px) scale(0.99); }
    .btn.secondary{
      background: rgba(255,255,255,0.9);
      color:#0b1220;
    }
    .btn.ghost{
      background: transparent;
      color:#0b1220;
      border:1px dashed rgba(255,255,255,0.6);
    }

    .btn-block{ width:100%; }
    .choice-grid{
      display:grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .choice-grid button{
      padding:14px 12px;
      border-radius: 14px;
      background: rgba(255,255,255,0.9);
      color:#0b1220;
      border: 1px solid rgba(0,0,0,0.06);
      font-weight:700;
    }

    input[type="text"], textarea{
      width:100%;
      border:1px solid rgba(255,255,255,0.5);
      background: rgba(255,255,255,0.85);
      color:#0b1220;
      padding:14px 12px;
      border-radius: 12px;
      font-size:16px;
      outline:none;
    }
    textarea{ min-height: 110px; resize: vertical;
    transition: 
    opacity 0.25s ease,
    background-color 0.25s ease,
    border-color 0.25s ease;}
    
    /* Greyed-out disabled state */
textarea:disabled {
  opacity: 0.6;
  background-color: rgba(255, 255, 255, 0.65);
  border-color: rgba(0, 0, 0, 0.05);
  cursor: not-allowed;
}

/* Active (enabled) state */
textarea:not(:disabled) {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.9);
  border-color: rgba(0, 0, 0, 0.15);
}

    .nav-row{
      display:flex; gap:10px; margin-top:6px;
    }
    .back{
      background: transparent;
      border:none;
      color: var(--btn-text);
      font-weight:800;
      font-size:20px;
      padding:8px 10px;
      line-height:1;
      cursor:pointer;
    }

    /* Likert with emojis */
    .likert{
      display:flex;
      flex-direction:column;
      gap:14px;
    }
    .likert-item{
      background: rgba(255,255,255,0.92);
      border:1px solid rgba(0,0,0,0.06);
      border-radius:12px;
      padding:10px;
    }
    .likert-title{
      font-weight:700; margin-bottom:8px; color:#0b1220;
      font-size:15px;
    }
    .faces {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(62px, 1fr));
  gap: clamp(4px, 1.2vw, 10px);
  justify-items: center;
}

    
    .face {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(0,0,0,0.08);
  background: #fff;
  border-radius: 10px;
  padding: 10px 4px;
  cursor: pointer;
  user-select: none;
  font-size: 22px;
  transition: all 0.15s ease;
   padding: clamp(6px, 1.8vw, 10px) clamp(4px, 1vw, 8px);
  font-size: clamp(18px, 4.5vw, 26px);
}

.face[data-active="true"] {
  transform: translateY(-2px);
outline: 2px solid var(--yh-orange);
  background: rgba(255,137,6,0.08);
    
}

.faces {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  justify-items: center;
}

.emoji {
  font-size: 26px;
  line-height: 1;
}

.emoji-label {
  font-size: clamp(9px, 2.8vw, 12px);
  font-weight: 600;
  color: var(--fg);
  text-align: center;
  line-height: 1.2;
  opacity: 0.85;
}

    .legend{
      display:grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      color:#0b1220;
      font-size: 12px;
      margin-top: 2px;
    }

    /* 1–4 choices */
    .grid-14, .grid-stars{
      display:grid; grid-template-columns: repeat(4, 1fr); gap:8px;
    }
    .grid-14 button{
      padding:12px 0;
      background:#fff;
      border:1px solid rgba(0,0,0,0.08);
      border-radius: 10px;
      font-weight:800; color:#0b1220;
    }
    .grid-14 button[data-active="true"]{
  color: #fff;
  transform: translateY(-1px);
  outline: 2px solid var(--yh-red);
  background: var(--yh-red);
  }

/* Stars 1–5 (brand blue gradient outline + fill) */
.stars-wrap {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 14px;
  background: rgba(255,255,255,0.9);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 16px;
}


/* FIRE ICON STYLING */
.star {
  font-size: 42px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.3em;
  height: 1.3em;
  cursor: pointer;

  /* neutral grey state */
  color: #b6b6b6;

  transition: all 0.2s ease;
  border: none;
  background: none;
}

/* Hover → yellow */
.star:hover i {
  color: var(--yh-yellow);
  transform: scale(1.15);
  filter: drop-shadow(0 0 6px rgba(255,212,70,0.6));
}

/* Active (selected) → orange→red gradient */
.star[data-active="true"] i {
  background: linear-gradient(140deg, var(--yh-yellow), var(--yh-orange), var(--yh-red));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 8px rgba(255,77,0,0.55));
  transform: scale(1.2);
}



    /* Bottom progress “snake” */
    .progress{
      position:absolute; left:0; right:0; bottom:0;
      height: calc(var(--progress-h) + 12px);
      display:flex; align-items:center; justify-content:center;
      padding: 8px 12px;
    }
    .progress-rail{
  width: min(640px, 88vw);
  height: var(--progress-h);
  background: rgba(255,255,255,0.25);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 999px;
  position:relative;
  overflow: hidden;
}
    .progress-fill{
      position:absolute; inset:0;
      background: linear-gradient(90deg,
        rgba(255,255,255,0.0) 0%,
        rgba(255,255,255,0.25) 50%,
        rgba(255,255,255,0.0) 100%);
      background-size: 220% 100%;
      animation: shimmer 2.2s linear infinite;
      pointer-events:none;
    }
    @keyframes shimmer{
      0%{ background-position: 220% 0; }
      100%{ background-position: -120% 0; }
    }
 .snake{
  position:absolute;
  top:50%;
  left:2%;
  width:60px;
  height:var(--progress-h);
  transform:translateY(-50%);
  border-radius:var(--progress-h);

  background: linear-gradient(90deg, var(--yh-orange) 0%, var(--yh-red) 85%);
  box-shadow:
      0 0 8px rgba(255,77,0,0.6),
      inset 0 0 4px rgba(255,255,255,0.3);
  animation: slither 1.2s ease-in-out infinite;
}


.snake::before {
  content:"";
  position:absolute;
  right:-8px;
  top:50%;
  width:0;
  height:0;
  border:11px solid var(--yh-red);
  border-left-color:transparent;
  border-radius:50%;
  transform:translateY(-50%) rotate(20deg);
}


.snake::after {
  content:"";
  position:absolute;
  right:4px;
  top:50%;
  width:5px;
  height:5px;
  background:#fff;
  border-radius:50%;
  transform:translateY(-50%);
}




@keyframes slither {
  0%,100% { transform: translateY(-50%) scaleX(1); }
  50% { transform: translateY(-50%) scaleX(1.15); }
}
    .food{
      position:absolute; top:50%;
      width: var(--food-size); height: var(--food-size);
  background: var(--yh-red);
  border-radius: 3px;
      transform: translate(-50%, -50%) rotate(45deg);
      box-shadow: 0 0 0 2px rgba(239,68,68,0.2);
    }
    .progress-text{
      position:absolute; inset:0;
      display:flex; align-items:center; justify-content:center;
      font-size: 12px; font-weight: 800; color:#0b1220;
      mix-blend-mode: multiply;
    }

    /* Small helper pill */
    .pill{
      align-self:center;
      background: rgba(255,255,255,0.9);
      color:#0b1220;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      border:1px solid rgba(0,0,0,0.06);
    }

    .employees-left{
      display:flex; flex-wrap:wrap; gap:6px;
      justify-content:center;
    }
    .tag{
      background:#fff; color:#0b1220; border:1px solid rgba(0,0,0,0.06);
      border-radius:999px; padding:6px 10px; font-size:12px;
    }
    .nav-row.combined{
  display:flex;
  justify-content: space-between;
  align-items: center;
  gap:12px;
  margin-top:12px;
}

.nav-row.combined .btn{
  flex:1;
}

.nav-row.combined .btn.ghost{
  flex:0 0 auto;
  padding:12px 16px;
  font-size:20px;
  line-height:1;
  background:rgba(255,255,255,0.85);
  border-radius:12px;
  color:#0b1220;
}

.choice-grid button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 10px;
  border-radius: 14px;
  background: rgba(255,255,255,0.9);
  color:#0b1220;
  border: 1px solid rgba(0,0,0,0.06);
  font-weight:700;
}

.choice-grid .avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(18,140,204,0.4);
  box-shadow: 0 2px 8px rgba(30,69,150,0.25);
  background: #fff;
}

.choice-grid button:hover .avatar {
  transform: translateY(-3px);
  transition: transform 0.2s ease;
}


textarea:not(:disabled) {
  animation: fadeEnable 0.2s ease;
}
@keyframes fadeEnable {
  from { opacity: 0.6; }
  to   { opacity: 1; }
}

textarea.inactive {
  opacity: 0.6;
  background-color: rgba(255, 255, 255, 0.65);
  border-color: rgba(0, 0, 0, 0.05);
  cursor: not-allowed;
}

/* === Modal === */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
  animation: fadeIn 0.25s ease;
}

#modalOverlay[hidden] {
  display: none !important;
}


.modal-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-stroke);
  backdrop-filter: blur(16px) saturate(140%);
  border-radius: 22px;
  padding: 28px 22px;
  text-align: center;
  color: var(--fg);
  width: min(90vw, 380px);
  box-shadow: 0 12px 44px rgba(0,0,0,0.25);
  animation: scaleIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scaleIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* === Snake Head inside modal === */
.snake-face {
  position: relative;
  width: 60px;
  height: 60px;
  margin: 0 auto 10px;
}
.pac-head {
  width: 0;
  height: 0;
  border: 30px solid var(--danger);
  border-left-color: transparent; /* changed */
  border-radius: 50%;
  transform: rotate(45deg); /* tilt it toward the right */
  animation: pac-bite 0.6s infinite;
}

.pac-mouth.upper {
  border-bottom-color: transparent;
}
.pac-mouth.lower {
  border-top-color: transparent;
}
@keyframes pac-bite {
  0%,100% { transform: rotate(0deg); }
  50% { transform: rotate(20deg); }
}

.snake-face .eye {
  position: absolute;
  top: 10px;
  left: 32px;
  font-size: 20px;
  color: #fff;
  transform: rotate(10deg);
}

#cookieModal[hidden] {
  display: none !important;
}

/* ---------------------------------------
   PURE CSS SMOKE (NO PNG / NO GIF NEEDED)
   --------------------------------------- */

.card.smoke-low::before,
.card.smoke-mid::before,
.card.smoke-high::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;

  /* blurry smokey gradient "cloud" */
  background: radial-gradient(
      circle at 50% 120%,
      rgba(255, 255, 255, 0.35) 0%,
      rgba(255, 255, 255, 0.20) 35%,
      rgba(255, 255, 255, 0.0) 70%
  );

  filter: blur(22px);
  opacity: 0;
  animation: smokeFloat 1.8s ease forwards;
}

.card.smoke-low::before { opacity: 0.18; }
.card.smoke-mid::before { opacity: 0.28; }
.card.smoke-high::before { opacity: 0.42; }

@keyframes smokeFloat {
  0%   { transform: translateY(18px) scale(1);   opacity: 0; }
  50%  { transform: translateY(-4px) scale(1.1); opacity: 0.3; }
  100% { transform: translateY(-12px) scale(1.25); opacity: inherit; }
}

/* heat glow */
.card.heat-1 { box-shadow: 0 0 8px rgba(0,0,0,0.2); }
.card.heat-2 { box-shadow: 0 0 12px rgba(255,137,6,0.4); }
.card.heat-3 { box-shadow: 0 0 18px rgba(255,137,6,0.55); }
.card.heat-4 { box-shadow: 0 0 26px rgba(255,77,0,0.7); }
.card.heat-5 { box-shadow: 0 0 40px rgba(255,40,0,0.85); }

/* burnt edges for 5 flames */
.card.burnt::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    inset 0 0 18px rgba(0,0,0,0.55),
    inset 0 0 28px rgba(0,0,0,0.4);
}


/* Reaction text styling */
.star-reaction {
  font-size: clamp(22px, 6vw, 28px);
  font-weight: 700;
  text-align: center;
  margin-top: 12px;
  color: var(--fg);
  line-height: 1.2;
    animation: fadeUp 0.35s ease;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

    /* Employee carousel styles */
    .emp3{
      padding: 6px 0 10px;
    }
    .emp3__head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin:0 0 10px;
    }
    .emp3__title{
      margin:0;
      font-weight:900;
      font-size:18px;
      line-height:1.15;
      letter-spacing:.2px;
    }
    .emp3__controls{
      display:flex;
      gap:10px;
    }
    .emp3__btn{
      width:44px;
      height:44px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.28);
      background:rgba(255,255,255,.18);
      backdrop-filter:blur(10px);
      -webkit-backdrop-filter:blur(10px);
      box-shadow:0 12px 30px rgba(0,0,0,.12);
      cursor:pointer;
      display:grid;
      place-items:center;
      user-select:none;
      transition:transform .12s ease, box-shadow .12s ease, background .12s ease;
    }
    .emp3__btn:hover{
      transform:translateY(-1px);
      background:rgba(255,255,255,.24);
      box-shadow:0 16px 36px rgba(0,0,0,.16);
    }
    .emp3__btn:active{
      transform:translateY(0) scale(.98);
    }
    .emp3__btn span{
      color:#D00000;
      font-size:22px;
      font-weight:700;
      line-height:1;
    }
    .emp3__rail{
      --gap: 14px;
      --peek: 18px;
      --w: min(78vw, 360px);

      display:grid;
      grid-auto-flow:column;
      grid-auto-columns:var(--w);
      gap:var(--gap);

      overflow-x:auto;
      overscroll-behavior-x:contain;
      -webkit-overflow-scrolling:touch;

      padding:10px var(--peek) 14px;
      scroll-snap-type:none;
      scroll-padding-inline:var(--peek);
      scrollbar-width:none;
      outline:none;

      mask-image: linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
      -webkit-mask-image: linear-gradient(to right, transparent 0, #000 18px, #000 calc(100% - 18px), transparent 100%);
    }
    .emp3__rail::-webkit-scrollbar{
      display:none;
    }
    .emp3__card{
      background:#fff;
      border:1px solid rgba(0,0,0,.10);
      border-radius:16px;
      overflow:hidden;
      box-shadow:0 14px 40px rgba(0,0,0,.08);
      transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease;
      cursor:pointer;
    }
    .emp3__card.is-active{
      transform:translateY(-4px);
      box-shadow:0 18px 52px rgba(0,0,0,.12);
      border-color:rgba(0,0,0,.16);
    }
    .emp3__media{
      aspect-ratio:4 / 3;
      background:#f2f2f2;
    }
    .emp3__media img{
      width:100%;
      height:100%;
      display:block;
      object-fit:cover;
    }
    .emp3__meta{
      padding:12px 14px 14px;
      display:flex;
      justify-content:center;
    }
    .emp3__name{
      font-weight:900;
      font-size:14px;
      letter-spacing:.2px;
    }
    .emp3__footer{
      display:flex;
      justify-content:center;
      padding:8px 12px 0;
    }
.emp3__dots{
  display:flex;
  justify-content:center;
  gap:8px;
  align-items:center;
  width:100%;
}
.emp3__dot{
  width:7px;
  height:7px;
  border-radius:999px;
  background:rgba(0,0,0,.18);
  border:0;
  padding:0;
  cursor:pointer;
  transition:width .12s ease, transform .12s ease, opacity .12s ease;
}
.emp3__dot[aria-current="true"]{
  width:22px;
  opacity:.9;
}
.emp3__dot:hover{
  transform:scale(1.1);
}

@media (min-width: 768px){
  .emp3__title{
    font-size:20px;
  }
  .emp3__rail{
    --w: 320px;
    --peek: 24px;
  }
}

@media (prefers-reduced-motion: reduce){
  .emp3__btn,
  .emp3__card,
  .emp3__dot{
    transition:none !important;
  }
}
  </style>
  
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

</head>
<body>
  <div class="wrap">
    <main class="card" role="form" aria-label="Chestionar feedback">
      <div class="card-body" id="cardBody">

        <!-- Step content will be injected by JS -->
        
      </div>

      <!-- Progress “snake” -->
      <div class="progress" aria-hidden="true">
        <div class="progress-rail" id="rail">
          <div class="progress-fill"></div>
          <div class="snake" id="snake" style="left:2%;"></div>
          <div class="food"  id="food"  style="left:96%;"></div>
          <div class="progress-text" id="ptext">0%</div>
        </div>
      </div>
    </main>

  </div>

<!-- Feedback modal -->
<div id="modalOverlay" class="modal-overlay" hidden>
  <div class="modal-card">
    <div class="snake-face">
      <div class="pac-head">
        <div class="pac-mouth upper"></div>
        <div class="pac-mouth lower"></div>
      </div>
      <span class="eye">✖</span>
    </div>
    <h2>Ai omis ceva</h2>
<p>Te rugăm să selectezi o notă.</p>
    <button class="btn btn-block" id="modalClose">Am înțeles</button>
  </div>
</div>

<!-- Cookie modal -->
<div id="cookieModal" class="modal-overlay" hidden>
  <div class="modal-card">
    <div class="snake-face">
      <div class="pac-head"></div>
      <span class="eye">😴</span>
    </div>
    <h2>Ai trimis deja un feedback</h2>
    <p>Poți reveni mâine pentru a trimite un nou feedback.</p>
    <button class="btn btn-block" id="cookieClose">Am înțeles</button>
  </div>
</div>


    <script defer>
        

        
  (function(){
    const $ = (sel, root=document)=>root.querySelector(sel);
    const $$ = (sel, root=document)=>Array.from(root.querySelectorAll(sel));


// Ensure modal starts hidden
window.addEventListener("DOMContentLoaded", () => {
  const m = document.getElementById("modalOverlay");
  if (m) m.hidden = true;
});


function showModal() {
  const m = document.getElementById("modalOverlay");
  if (!m) return;
  m.hidden = false;
  $("#modalClose", m).onclick = () => (m.hidden = true);
  m.addEventListener("click", e => {
    if (e.target === m) m.hidden = true;
  });
}

function showErrorModal(msg) {
  const m = document.getElementById("modalOverlay");
  m.querySelector("h2").textContent = "Eroare la trimitere";
  m.querySelector("p").textContent = msg || "A apărut o eroare neașteptată.";
  m.hidden = false;
  $("#modalClose", m).onclick = () => (m.hidden = true);
}

function showCookieModal() {
  const m = document.getElementById("cookieModal");
  m.hidden = false;
  $("#cookieClose", m).onclick = () => (m.hidden = true);
  m.addEventListener("click", e => {
    if (e.target === m) m.hidden = true;
  });
}




    // App state
const EMPLOYEE_DATA = [
  {
    name: "Luminița",
    image: "img/employees/Luminita.png"
  },
  {
    name: "Paula",
    image: "img/employees/Paula.png"
  },
  {
    name: "Roxana",
    image: "img/employees/Roxana1.png"
  },
  {
    name: "Ștefania",
    image: "img/employees/Stefania.png"
  },
  {
    name: "Cori",
    image: "img/employees/Cori-1.png"
  }
];

const ALL_EMPLOYEES = EMPLOYEE_DATA.map(emp => emp.name);


    const state = {
  step: 0,
  name: "",
  remainingEmployees: [...ALL_EMPLOYEES],
  employeeResults: [],
  general: { 
  recommendProb: null,
  vibe: null
},
  open: { liked: "" },
  stars: 0,

  // 🔥 Add this:
  _savedEmployeeState: null
};




    const EMPLOYEE_SELECT_STEP = 3;
    const EMPLOYEE_LIKERT_STEP = 4;
    const LOOP_DECISION_STEP = 5;

    const cardBody = $("#cardBody");

    function render(){
      cardBody.innerHTML = "";
      switch(state.step){
        case 0: return renderSplash();
        case 1: return renderIntro();
        case 2: return renderIdentity();
        case 3: return renderEmployeeSelect();
        case 4: return renderEmployeeLikertEmojis();
        case 5: return renderEmployeeMistakes();
        case 6: return renderLoopDecision();
        case 7: return renderGeneral();
        case 8: return renderOpen();
        case 9: return renderStars();
        case 10: return renderThanks();

      }
    }

    // --- INDIVIDUAL CARDS ---
    function renderSplash(){
      const wrap = document.createElement("div");
      wrap.className = "logo-zone";

      const logo = document.createElement("img");
      logo.src = "img/logo.png";
      logo.alt = "Logo";
      logo.className = "logo";

      const ch = document.createElement("img");
      ch.src = "img/character.png";
      ch.alt = "Personaj";
      ch.className = "character";

      wrap.append(logo, ch);

      const cta = document.createElement("button");
      cta.className = "btn btn-block";
      cta.textContent = "Începe";
      cta.addEventListener("click", ()=> next());

      cardBody.append(wrap, cta);
      updateProgressUI();
    }

    function renderIntro(){
      const h = el("h1","center","Ne ajuți să fim mai buni!");
      const p = el("p","center","");
      const nav = navRowWithNext("Continuă", ()=> next());
      cardBody.append(h,p,nav);
      updateProgressUI();
    }

    function renderIdentity(){
      const h = el("h2","", "Spune-ne cine ești");
      const sub = el("p","muted","");
      const inp = document.createElement("input");
      inp.type = "text";
      inp.placeholder = "Numele tău (opțional)";
      inp.value = state.name || "";
      inp.addEventListener("input", e=> state.name = e.target.value);

      const nav = navRowWithNext("Următor", ()=> next());
      cardBody.append(h, sub, inp, nav);
      updateProgressUI();
    }


function renderEmployeeSelect() {
  if (!state.remainingEmployees || state.remainingEmployees.length === 0) {
    state.step = 7;
    return render();
  }

  const h = el("h2", "", "Alege colegul căruia să îi dai notă:");
  const sub = el("p", "muted", "");

  const section = document.createElement("section");
  section.className = "emp3 emp3--inside";

  const head = document.createElement("div");
  head.className = "emp3__head";

  const title = document.createElement("h3");
  title.className = "emp3__title";
  title.textContent = "Echipa care gătește și servește";

  const controls = document.createElement("div");
  controls.className = "emp3__controls";

  const prevBtn = document.createElement("button");
  prevBtn.className = "emp3__btn";
  prevBtn.type = "button";
  prevBtn.setAttribute("aria-label", "Înapoi");
  prevBtn.innerHTML = '<span aria-hidden="true">‹</span>';

  const nextBtn = document.createElement("button");
  nextBtn.className = "emp3__btn";
  nextBtn.type = "button";
  nextBtn.setAttribute("aria-label", "Înainte");
  nextBtn.innerHTML = '<span aria-hidden="true">›</span>';

  controls.append(prevBtn, nextBtn);
  head.append(title, controls);

  const rail = document.createElement("div");
  rail.className = "emp3__rail";
  rail.tabIndex = 0;
  rail.setAttribute("aria-label", "Carusel echipă");

  const availableEmployees = EMPLOYEE_DATA.filter(emp =>
    state.remainingEmployees.includes(emp.name)
  );

  availableEmployees.forEach(emp => {
    const card = document.createElement("article");
    card.className = "emp3__card";
    card.dataset.name = emp.name;

    const media = document.createElement("div");
    media.className = "emp3__media";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.src = emp.image;
    img.alt = emp.name;

    const meta = document.createElement("div");
    meta.className = "emp3__meta";

    const name = document.createElement("div");
    name.className = "emp3__name";
    name.textContent = emp.name;

    media.appendChild(img);
    meta.appendChild(name);
    card.append(media, meta);

    card.addEventListener("click", () => {
      state.currentEmployee = emp.name;
      resetEmployeeTemp();
      next();
    });

    rail.appendChild(card);
  });

  const footer = document.createElement("div");
  footer.className = "emp3__footer";

  const dots = document.createElement("div");
  dots.className = "emp3__dots";
  dots.setAttribute("aria-label", "Navigare carusel");

  footer.appendChild(dots);
  section.append(head, rail, footer);

  // Centered back arrow only
  const nav = document.createElement("div");
  nav.className = "nav-row combined";
  nav.style.justifyContent = "center";
  nav.style.marginTop = "8px";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "btn ghost";
  back.textContent = "←";
  back.addEventListener("click", () => prev());
  nav.appendChild(back);

  cardBody.append(h, sub, section, nav);
  updateProgressUI();

  initEmployeeCarousel(section);
}

// Employee carousel helper
function initEmployeeCarousel(section) {
  const rail = section.querySelector('.emp3__rail');
  const prev = section.querySelector('.emp3__controls .emp3__btn:first-child');
  const next = section.querySelector('.emp3__controls .emp3__btn:last-child');
  const dotsWrap = section.querySelector('.emp3__dots');

  if (!rail || !prev || !next || !dotsWrap) return;

  const originals = Array.from(rail.querySelectorAll('.emp3__card'));
  const N = originals.length;
  if (!N) return;

  dotsWrap.innerHTML = '';

  const dots = originals.map((card, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'emp3__dot';
    b.setAttribute('aria-label', 'Mergi la ' + (card.dataset.name || ('Card ' + (i + 1))));
    b.addEventListener('click', () => scrollToLogicalIndex(i));
    dotsWrap.appendChild(b);
    return b;
  });

  function buildInfiniteTrack() {
    const before = document.createDocumentFragment();
    const after = document.createDocumentFragment();

    originals.forEach(card => {
      const c1 = card.cloneNode(true);
      c1.classList.add('is-clone');
      c1.addEventListener('click', () => {
        const name = c1.dataset.name;
        state.currentEmployee = name;
        resetEmployeeTemp();
        next();
      });
      before.appendChild(c1);
    });

    originals.forEach(card => {
      const c2 = card.cloneNode(true);
      c2.classList.add('is-clone');
      c2.addEventListener('click', () => {
        const name = c2.dataset.name;
        state.currentEmployee = name;
        resetEmployeeTemp();
        next();
      });
      after.appendChild(c2);
    });

    rail.prepend(before);
    rail.appendChild(after);
  }

  buildInfiniteTrack();

  const allCards = Array.from(rail.querySelectorAll('.emp3__card'));
  const startIndex = N;

  function getStep() {
    const first = rail.querySelector('.emp3__card');
    if (!first) return 0;
    const railStyle = getComputedStyle(rail);
    const gap = parseFloat(railStyle.columnGap || railStyle.gap || 0) || 0;
    return first.getBoundingClientRect().width + gap;
  }

  function railCenter() {
    const r = rail.getBoundingClientRect();
    return r.left + r.width / 2;
  }

  function closestPhysicalIndex() {
    const center = railCenter();
    let best = 0;
    let bestDist = Infinity;

    allCards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const d = Math.abs(c - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });

    return best;
  }

  function toLogical(iPhysical) {
    return ((iPhysical - startIndex) % N + N) % N;
  }

  function setActiveByPhysical(iPhysical) {
    const logical = toLogical(iPhysical);

    allCards.forEach((card, idx) => {
      card.classList.toggle('is-active', idx === iPhysical);
    });

    dots.forEach((dot, idx) => {
      dot.setAttribute('aria-current', idx === logical ? 'true' : 'false');
    });
  }

  function scrollToPhysicalIndex(idx, behavior = 'smooth') {
    const card = allCards[idx];
    if (!card) return;
    card.scrollIntoView({
      behavior,
      inline: 'center',
      block: 'nearest'
    });
  }

  function scrollToLogicalIndex(iLogical, behavior = 'smooth') {
    const idx = startIndex + iLogical;
    scrollToPhysicalIndex(idx, behavior);
    setActiveByPhysical(idx);
  }

  function normalizeIfNeeded() {
    const i = closestPhysicalIndex();
    const step = getStep();
    if (!step) return;

    if (i < N) {
      rail.scrollLeft += step * N;
    } else if (i >= 2 * N) {
      rail.scrollLeft -= step * N;
    }

    setActiveByPhysical(closestPhysicalIndex());
  }

  function goNext() {
    scrollToPhysicalIndex(closestPhysicalIndex() + 1);
  }

  function goPrev() {
    scrollToPhysicalIndex(closestPhysicalIndex() - 1);
  }

  prev.addEventListener('click', goPrev);
  next.addEventListener('click', goNext);

  rail.addEventListener('scroll', () => {
    setActiveByPhysical(closestPhysicalIndex());
    normalizeIfNeeded();
  }, { passive: true });

  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNext();
    }
  });

  requestAnimationFrame(() => {
    scrollToLogicalIndex(0, 'auto');
    setTimeout(() => {
      normalizeIfNeeded();
      setActiveByPhysical(closestPhysicalIndex());
    }, 60);
  });
}

    
    

// --- NEW LIKERT SEQUENCE (3 CARDS) ---
function renderEmployeeLikertEmojis(){
  const h = el("h2","", `Îl/o evaluezi pe: ${state.currentEmployee}`);
  const sub = el("p","muted center", ``);
  

  const items = [
    { key:"attitude", label:"Atitudinea angajatului" },
    { key:"waitTime", label:"Timp de așteptare" },
  ];

  const wrap = document.createElement("div");
  wrap.className = "likert";

  items.forEach(it=>{
    const box = document.createElement("div");
    box.className = "likert-item";
    const tt = el("div","likert-title", it.label);

    const faces = document.createElement("div");
    faces.className = "faces";

    // reversed order: unhappy first → happy last
    const opts = [
  {v:1, emoji:"😠", label:"Foarte nemulțumit"},
  {v:2, emoji:"😕", label:"Nemulțumit"},
  {v:3, emoji:"🙂", label:"Mulțumit"},
  {v:4, emoji:"😃", label:"Foarte mulțumit"},
];

    const current = _likertBuffer[it.key] || null;
    opts.forEach(o=>{
      const b = document.createElement("button");
      b.type = "button";
      b.className = "face";
      b.dataset.value = o.v;
      b.dataset.key = it.key;
      b.dataset.active = (current===o.v) ? "true":"false";
      
      const emojiSpan = document.createElement("div");
emojiSpan.className = "emoji";
emojiSpan.textContent = o.emoji;

const labelSpan = document.createElement("div");
labelSpan.className = "emoji-label";
labelSpan.textContent = o.label;

b.innerHTML = "";
b.append(emojiSpan, labelSpan);

      
      b.addEventListener("click", ()=>{
        $$(`.face[data-key="${it.key}"]`, faces).forEach(f=> f.dataset.active="false");
        b.dataset.active="true";
        _likertBuffer[it.key]=o.v;
      });
      faces.appendChild(b);
    });

    box.append(tt, faces);
    wrap.append(box);
  });

const nav = navRowWithNext("Continuă", ()=> {
  const ratings = {};
  let allAnswered = true;
  items.forEach(it => {
    ratings[it.key] = _likertBuffer[it.key] || null;
    if (!_likertBuffer[it.key]) allAnswered = false;
  });
  if (!allAnswered) return showModal();

  // ✅ Store ratings temporarily, not pushed yet
  state.tempRatings = ratings;
  next(); // go to mistakes step next
});



  cardBody.append(h, sub, wrap, nav);
  updateProgressUI();
}


function renderEmployeeMistakes() {
  const h = el("h2", "", `Au fost greșeli în comanda procesată de ${state.currentEmployee}?`);
  const sub = el("p", "muted center", ``);

  const btnWrap = document.createElement("div");
  btnWrap.className = "row";

  const yesBtn = buttonPrimary("Da", () => {
    state.mistakeAnswer = "yes";
    renderEmployeeMistakesDetail();
  });

const noBtn = buttonSecondary("Nu", () => {
  state.mistakeAnswer = "no";

  // ✅ Save “no mistake” result for this employee too
state.employeeResults.push({
  employee: state.currentEmployee,
  ratings: state.tempRatings || _likertBuffer,
  mistakeAnswer: "no",
  mistakeDetails: { issues: [], text: "" }
});


  // ✅ Clean up and go on
  state.remainingEmployees = state.remainingEmployees.filter(n => n !== state.currentEmployee);
  delete state.currentEmployee;

  if (state.remainingEmployees.length === 0) {
    state.step = 7;
    return render();
  }

  state.step = 6;
  render();
});



  btnWrap.append(yesBtn, noBtn);

const nav = document.createElement("div");
nav.className = "nav-row combined";
nav.style.justifyContent = "center";
nav.style.marginTop = "8px";

const back = document.createElement("button");
back.type = "button";
back.className = "btn ghost";
back.textContent = "←";
back.addEventListener("click", () => prev());

nav.appendChild(back);


  cardBody.append(h, sub, btnWrap, nav);
  updateProgressUI();
}

function renderEmployeeMistakesDetail() {
    
    state._savedEmployeeState = {
  currentEmployee: state.currentEmployee,
  tempRatings: {...state.tempRatings},
  mistakeAnswer: state.mistakeAnswer,
  mistakeDetails: {...state.mistakeDetails}
};

  cardBody.innerHTML = "";

  const h = el("h2", "", "Ce tip de problemă ai întâmpinat?");
  const sub = el("p", "muted center", "");

  const options = [
    "Nu am primit ce am comandat",
    "Mâncarea a fost rece",
    "A trebuit să aștept prea mult",
    "Am avut altă problemă"
];

  state.mistakeDetails = state.mistakeDetails || { issues: [], text: "" };
  const wrap = document.createElement("div");
  wrap.className = "col";

 // --- Create textarea first (will be referenced later)
const txt = document.createElement("textarea");
txt.placeholder = "Descrie problema (opțional)";
txt.value = state.mistakeDetails.text;
txt.readOnly = true; // not disabled anymore
txt.classList.add("inactive"); // greyed-out style

// ✅ Keep text synced with state
txt.addEventListener("input", e => {
  state.mistakeDetails.text = e.target.value;
});


// --- Helper to enable textarea
function enableTextarea() {
  txt.readOnly = false;
  txt.classList.remove("inactive");
  txt.focus();
}

  // --- Checkbox list
  options.forEach(opt => {
    const lbl = document.createElement("label");
    lbl.style.display = "flex";
    lbl.style.alignItems = "center";
    lbl.style.gap = "8px";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = opt;
    cb.checked = state.mistakeDetails.issues.includes(opt);

cb.addEventListener("change", e => {
  if (e.target.checked) {
    state.mistakeDetails.issues.push(opt);
    if (opt === "Am avut altă problemă") enableTextarea();
  } else {
    state.mistakeDetails.issues = state.mistakeDetails.issues.filter(v => v !== opt);
    if (!state.mistakeDetails.issues.includes("Am avut altă problemă")) {
      txt.readOnly = true;
      txt.classList.add("inactive");
    }
  }
});


    const span = el("span", "", opt);
    lbl.append(cb, span);
    wrap.appendChild(lbl);
  });



// also keep the focus handler (for keyboard/tab)
txt.addEventListener("focus", checkOtherProblem);
txt.addEventListener("click", checkOtherProblem);



function checkOtherProblem() {
  const lastOpt = options[options.length - 1]; // “Am avut altă problemă”
  if (!state.mistakeDetails.issues.includes(lastOpt)) {
    state.mistakeDetails.issues.push(lastOpt);
    $$('input[type="checkbox"]', wrap).forEach(chk => {
      if (chk.value === lastOpt) chk.checked = true;
    });
  }
  enableTextarea();
}


  wrap.append(txt);

const nav = navRowWithNext("Continuă", () => {
  const anyChecked = state.mistakeDetails.issues && state.mistakeDetails.issues.length > 0;
  if (!anyChecked) return showModal();

  // ✅ Save full employee evaluation with mistakes
state.employeeResults.push({
  employee: state.currentEmployee,
  ratings: state.tempRatings || _likertBuffer,
  mistakeAnswer: "yes",
  mistakeDetails: state.mistakeDetails
});

  // ✅ Remove evaluated employee
  state.remainingEmployees = state.remainingEmployees.filter(n => n !== state.currentEmployee);
  delete state.currentEmployee;

  // ✅ Continue
  if (state.remainingEmployees.length === 0) {
    state.step = 7; // Jump to general feedback
    return render();
  }
  next();
});


  cardBody.append(h, sub, wrap, nav);
  updateProgressUI();
}



function renderLoopDecision() {
  const h = el("h2", "center", "Vrei să evaluezi încă un angajat?");

  // --- the two main buttons ---
  const btns = document.createElement("div");
  btns.className = "row";

  const yes = buttonPrimary("Da, mai am unul", () => {
    // Reset everything related to the previous employee
    delete state.currentEmployee;
    delete state.mistakeAnswer;
    delete state.mistakeDetails;

    // Reset Likert (emoji) selections
    for (const key in _likertBuffer) delete _likertBuffer[key];

    // Move to employee selection step
    state.step = EMPLOYEE_SELECT_STEP;
    render();
  });

  const no = buttonSecondary("Nu, mergem mai departe", () => next());
  btns.append(yes, no);

  // --- centered arrow button (replaces 'Înapoi') ---
  const back = document.createElement("button");
  back.type = "button";
  back.className = "btn ghost";
  back.textContent = "←";
  back.style.display = "block";
  back.style.margin = "20px auto 0"; // centers horizontally
  back.addEventListener("click", () => prev());

  // --- final structure ---
  cardBody.append(h, btns, back);
  updateProgressUI();
}



    function renderGeneral(){
      const h = el("h2","", "Părere generală: (1 = Deloc probabil, 4 = Foarte probabil)");
      const hint = el("p","muted","");
      const q1 = el("p","", "Cât de probabil e să recomanzi magazinul unui prieten?");
      const g1 = grid14("recommendProb", state.general.recommendProb);

const q2 = el("p","", "Atmosfera / vibe-ul localului");
const g2 = grid14("vibe", state.general.vibe);

const nav = navRowWithNext("Continuă", ()=> {
  if (!state.general.recommendProb || !state.general.vibe) {
    return showModal();
  }
  next();
});
      cardBody.append(h, hint, q1, g1, q2, g2, nav);

      updateProgressUI();
    }

    function renderOpen(){
      const h = el("h2","", "Spune-ne mai multe");
      const hint = el("p","muted","");
      const l1 = el("label","", "Ce ți-a plăcut cel mai mult? (opțional)");
      const t1 = document.createElement("textarea");
      t1.placeholder = "Răspunsul tău…";
      t1.value = state.open.liked || "";
      t1.addEventListener("input", e=> state.open.liked = e.target.value);

const nav = navRowWithNext("Continuă", ()=> {
  next();
});
      cardBody.append(h, hint, l1, t1, nav);
      updateProgressUI();
    }

function applyFlameReaction(level) {
  const card = document.querySelector(".card");
  const reaction = document.getElementById("starReaction");

  // Reset previous classes
  card.classList.remove(
    "shake-small","shake-big",
    "smoke-low","smoke-mid","smoke-high",
    "heat-1","heat-2","heat-3","heat-4","heat-5",
    "burnt"
  );

  // Reaction text map
  const lines = {
    1: "Chef-ul a lăsat tigaia rece…",
    2: "A prins, dar nu destul.",
    3: "E rumenit, dar nu încă suculent.",
    4: "Așa se gătește!",
    5: "Perfecțiune! Avem maestru la grătar!"
  };

  // Insert text
  reaction.textContent = lines[level];

  // Apply effects
  switch(level){
    case 1:
      card.classList.add("shake-small","smoke-low","heat-1");
      break;

    case 2:
      card.classList.add("shake-small","smoke-low","heat-2");
      break;

    case 3:
      card.classList.add("smoke-mid","heat-3");
      break;

    case 4:
      card.classList.add("smoke-mid","heat-4","shake-small");
      break;

    case 5:
      card.classList.add("smoke-high","heat-5","shake-big","burnt");
      break;
  }
}



    function renderStars(){
      const h = el("h2","center", "Dă-ne o notă finală");
      const p = el("p","center muted","");
      const stars = document.createElement("div");
      stars.className = "stars-wrap";


      for (let i=1;i<=5;i++){
        const s = document.createElement("button");
        s.type = "button";
        s.className = "star";
        s.dataset.value = String(i);
        s.dataset.active = state.stars >= i ? "true":"false";
s.innerHTML = '<i class="fa-solid fa-star"></i>';
       s.addEventListener("click", ()=>{
      state.stars = i;
      $$("button.star", stars)
    .forEach(st=> st.dataset.active = Number(st.dataset.value) <= i ? "true":"false");

      applyFlameReaction(i);
        });
        stars.appendChild(s);
      }
      



      const nav = navRowWithNext("Trimite feedback", onSubmit);
const reaction = document.createElement("div");
reaction.id = "starReaction";
reaction.className = "star-reaction";
cardBody.append(h, p, stars, reaction, nav);
      updateProgressUI();
    }

    function renderThanks(){
      const h = el("h1","center","Mulțumim pentru feedback!");
      const sub = el("p","center muted","Răspunsurile tale ne ajută să devenim mai buni.");
      const pill = el("div","pill", "Poți închide fereastra.");
      cardBody.append(h, sub, pill);
      updateProgressUI(100);
    }

    // --- UI HELPERS ---
    function el(tag, cls, text){
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text!=null) e.textContent = text;
      return e;
    }

    function buttonPrimary(label, onClick){
      const b = document.createElement("button");
      b.type = "button"; 
      b.className = "btn btn-block";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    }

    function buttonSecondary(label, onClick){
      const b = document.createElement("button");
      b.type = "button"; 
      b.className = "btn btn-block secondary";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    }

    // Combined nav row (arrow + main button)
    function navRowWithNext(label, nextHandler){
      const nav = document.createElement("div");
      nav.className = "nav-row combined";

      const back = document.createElement("button");
      back.type = "button";
      back.className = "btn ghost";
      back.textContent = "←";
      back.addEventListener("click", ()=> prev());

      const next = document.createElement("button");
      next.type = "button";
      next.className = "btn";
      next.textContent = label;
      next.addEventListener("click", nextHandler);

      nav.append(back, next);
      return nav;
    }

    function legendFaces(){
      const wrap = document.createElement("div");
      wrap.className = "legend";
      ["foarte nemulțumit", "cumva nemulțumit", "aproape mulțumit", "mulțumit"]
        .forEach(t=> wrap.append(el("span","",t)));
      return wrap;
    }

    const _likertBuffer = {};
    function likertItem(key, label){
      const box = document.createElement("div");
      box.className = "likert-item";
      const tt = el("div","likert-title", label);
      const faces = document.createElement("div");
      faces.className = "faces";
      const opts = [
        {v:1, emoji:"😃", title:"mulțumit"},
        {v:2, emoji:"🙂", title:"aproape mulțumit"},
        {v:3, emoji:"😕", title:"cumva nemulțumit"},
        {v:4, emoji:"😠", title:"foarte nemulțumit"},
      ];
      const current = _likertBuffer[key] || null;
      opts.forEach(o=>{
        const b = document.createElement("button");
        b.type = "button";
        b.className = "face";
        b.dataset.value = String(o.v);
        b.dataset.key = key;
        b.dataset.active = (current===o.v) ? "true":"false";
        b.textContent = o.emoji;
        b.addEventListener("click", ()=>{
          $$(`.face[data-key="${key}"]`, faces).forEach(f=> f.dataset.active = "false");
          b.dataset.active = "true";
          _likertBuffer[key] = o.v;
        });
        faces.appendChild(b);
      });
      box.append(tt, faces);
      return box;
    }

    function activeFaceValue(key){
      return _likertBuffer[key] ? Number(_likertBuffer[key]) : null;
    }

    function grid14(which, current){
      const g = document.createElement("div");
      g.className = "grid-14";
      [1,2,3,4].forEach(n=>{
        const b = document.createElement("button");
        b.type="button";
        b.textContent = String(n);
        b.dataset.value = String(n);
        b.dataset.active = (current===n) ? "true":"false";
        b.addEventListener("click", ()=>{
          $$(".grid-14 button", g).forEach(x=> x.dataset.active="false");
          b.dataset.active = "true";
          state.general[which] = n;
        });
        g.appendChild(b);
      });
      return g;
    }
// Reset temporary data for a fresh employee evaluation
function resetEmployeeTemp() {
  // Clear likert buffer
  for (const k in _likertBuffer) delete _likertBuffer[k];

  // FULL RESET for a new employee
  state.mistakeAnswer = null;
  state.mistakeDetails = { issues: [], text: "" };
  state.tempRatings = null;
  state._savedEmployeeState = null;
}



    // Navigation logic
// Navigation logic
function next(){ 
  state.step++; 
  render(); 
}

function prev(){
  // going back from mistakes detail → go to likert for THIS employee
  if (state.step === 5) {
    if (state._savedEmployeeState) {
      state.currentEmployee = state._savedEmployeeState.currentEmployee;
      state.tempRatings    = { ...state._savedEmployeeState.tempRatings };
      state.mistakeAnswer  = state._savedEmployeeState.mistakeAnswer;
      state.mistakeDetails = { ...state._savedEmployeeState.mistakeDetails };
    }
    state.step = 4;
    return render();
  }

  // going back from likert → employee select (currentEmployee not fixed yet)
  if (state.step === 4) {
    state.currentEmployee = null;
    state.step = 3;
    return render();
  }

  // 🔹 going back from "Vrei să evaluezi încă un angajat?"
  // you should NOT reopen the previous mistakes screen, that employee is done.
  if (state.step === 6) {
    state.step = 3;           // back to employee select
    return render();
  }

  // everything else
  state.step = Math.max(0, state.step - 1);
  render();
}



    // Submit
function onSubmit() {
  if (!state.stars) {
    return showModal(); // require a rating before sending
  }

  const payload = {
    name: (state.name || "").trim() || null,
    employees: state.employeeResults,
    general: state.general,
    open: state.open,
    stars: state.stars,
    ts: new Date().toISOString()
  };

  fetch("submit.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success") {
         state.step = 10;
  render(); // ✅ use unified renderer
      } else if (res.message?.includes("deja")) {
        showCookieModal(); // ✅ duplicate feedback modal
      } else {
        showErrorModal(res.message); // ✅ friendly error modal
      }
    })
    .catch(err => showErrorModal(err.message));
}



    // Progress UI (snake bar)
    function updateProgressUI(forcePercent=null){
  const snake = $("#snake");
  const food  = $("#food");
  const ptext = $("#ptext");
  const percent = (forcePercent!=null) ? forcePercent : calcPercent();

  // Body width grows as progress increases
  const maxWidth = 90; // percent of rail
  const bodyWidth = Math.max(5, percent * maxWidth);
  snake.style.width = bodyWidth + "%";

  // Head position
  const left = 2 + (percent * 0.96);
  snake.style.left = left + "%";

  // Slither glow pulse
  snake.style.filter = `drop-shadow(0 0 ${6 + Math.sin(Date.now()/200)*3}px rgba(255,77,0,0.7))`;

  ptext.textContent = Math.round(percent*100) + "%";

  // Food subtle jiggle
  const jitter = Math.sin(Date.now()/500)*0.3;
  food.style.left = (96 + jitter) + "%";
}


    function calcPercent(){
      const baseTotal = 9;
      const extraEmployees = Math.max(0, state.employeeResults.length - 1);
      const total = baseTotal + (extraEmployees * 2);
      const pct = Math.max(0, Math.min(1, state.step / (total-1)));
      return pct;
    }

    // Start
    render();
  })();
  </script>
</body>
</html>
