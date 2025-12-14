---
layout: single
title: "Hobbies"
permalink: /hobbies/
classes: hobbies-quest
---

<div id="hobby-quest" class="hq" role="application" aria-label="Interactive hobby decision tree">
  <canvas id="hq-bg" class="hq-bg" aria-hidden="true"></canvas>

  <div class="hq-stage">
    <div class="hq-card" id="hq-card" tabindex="0" aria-live="polite">
      <div class="hq-top">
        <div class="hq-crumbs" id="hq-crumbs" aria-hidden="true"></div>
        <div class="hq-badge" id="hq-badge" aria-hidden="true">✨</div>
      </div>

      <div class="hq-title" id="hq-title"></div>
      <div class="hq-body" id="hq-body"></div>

      <div class="hq-options" id="hq-options"></div>

      <div class="hq-footer">
        <button class="hq-btn hq-btn--ghost" id="hq-back" type="button" aria-label="Go back">← back</button>
        <button class="hq-btn" id="hq-shuffle" type="button" aria-label="Surprise me">🎲 surprise me</button>
        <button class="hq-btn hq-btn--ghost" id="hq-reset" type="button" aria-label="Restart">↺ restart</button>
      </div>

      <div class="hq-hint" id="hq-hint">Tip: click an option · press 1–9 · enjoy the tiny sparkles ✨</div>
    </div>
  </div>
</div>

<style>
  /* Keep this page as a single, full-bleed interactive component */
  body.hobbies-quest .page__title,
  body.hobbies-quest .page__meta {
    display: none !important;
  }

  /* Minimal Mistakes content wrappers (safe to override only on this page) */
  body.hobbies-quest #main,
  body.hobbies-quest .initial-content,
  body.hobbies-quest .page,
  body.hobbies-quest .page__inner-wrap,
  body.hobbies-quest .page__content {
    max-width: none !important;
  }

  body.hobbies-quest .page__content {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }

  /* --- The component --- */
  #hobby-quest {
    position: relative;
    width: 100vw;
    min-height: 100vh;
    margin-left: calc(50% - 50vw);
    overflow: hidden;
    border-radius: 22px;
    isolation: isolate;
    display: grid;
    place-items: center;

    /* Cute animated background (kept subtle) */
    background:
      radial-gradient(1200px 600px at 20% 10%, rgba(186, 230, 253, 0.8), transparent 60%),
      radial-gradient(900px 500px at 80% 20%, rgba(253, 230, 138, 0.75), transparent 55%),
      radial-gradient(900px 700px at 50% 90%, rgba(216, 180, 254, 0.5), transparent 60%),
      linear-gradient(135deg, rgba(241, 245, 249, 1), rgba(255, 255, 255, 1));
  }

  /* A soft grid like "CS paper" — not too loud */
  #hobby-quest::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, rgba(100, 116, 139, 0.08) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(100, 116, 139, 0.08) 1px, transparent 1px);
    background-size: 28px 28px;
    opacity: 0.55;
    pointer-events: none;
    mix-blend-mode: multiply;
  }

  /* Gentle noise for texture */
  #hobby-quest::after {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0.05;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.4'/%3E%3C/svg%3E");
  }

  #hq-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }

  .hq-stage {
    position: relative;
    z-index: 1;
    width: min(760px, 92vw);
    padding: 18px;
  }

  .hq-card {
    --rx: 0deg;
    --ry: 0deg;
    --tz: 0px;

    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: clamp(16px, 2.2vw, 22px);
    border-radius: 22px;
    border: 1px solid rgba(100, 116, 139, 0.22);
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(14px);
    box-shadow:
      0 18px 60px rgba(15, 23, 42, 0.14),
      0 1px 0 rgba(255, 255, 255, 0.7) inset;
    transform: translateZ(var(--tz)) rotateX(var(--rx)) rotateY(var(--ry));
    transform-style: preserve-3d;
    transition: transform 140ms ease, box-shadow 180ms ease;
    outline: none;

    max-height: min(720px, 86vh);
  }

  .hq-card:focus-visible {
    box-shadow:
      0 18px 60px rgba(15, 23, 42, 0.14),
      0 0 0 4px rgba(56, 189, 248, 0.35);
  }

  .hq-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .hq-crumbs {
    font-size: 12px;
    color: rgba(51, 65, 85, 0.75);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hq-badge {
    font-size: 14px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px dashed rgba(100, 116, 139, 0.32);
    background: rgba(255, 255, 255, 0.55);
  }

  .hq-title {
    font-family: "PT Sans Narrow", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    font-size: clamp(24px, 3.2vw, 34px);
    font-weight: 700;
    letter-spacing: -0.015em;
    line-height: 1.1;
    color: rgba(15, 23, 42, 0.92);
  }

  .hq-body {
    font-size: clamp(14px, 1.6vw, 16px);
    line-height: 1.55;
    color: rgba(30, 41, 59, 0.88);
  }

  .hq-body p {
    margin: 0 0 10px;
  }

  .hq-body ul {
    margin: 10px 0 0;
    padding-left: 18px;
  }

  .hq-body li {
    margin: 6px 0;
  }

  .hq-options {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 6px 2px 2px;
    overflow: auto;
  }

  @media (min-width: 720px) {
    .hq-options {
      grid-template-columns: 1fr 1fr;
    }
  }

  .hq-option {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    text-align: left;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid rgba(100, 116, 139, 0.22);
    background: rgba(241, 245, 249, 0.72);
    color: rgba(15, 23, 42, 0.9);
    cursor: pointer;
    transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
    user-select: none;
  }

  .hq-option:hover {
    transform: translateY(-2px);
    background: rgba(255, 255, 255, 0.78);
    border-color: rgba(56, 189, 248, 0.55);
  }

  .hq-option:active {
    transform: translateY(0px) scale(0.99);
  }

  .hq-option__key {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    border: 1px solid rgba(100, 116, 139, 0.25);
    background: rgba(255, 255, 255, 0.65);
    font-size: 12px;
    font-weight: 700;
    color: rgba(51, 65, 85, 0.85);
  }

  .hq-option__label {
    font-size: clamp(14px, 1.6vw, 16px);
    line-height: 1.2;
  }

  .hq-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 4px;
  }

  .hq-btn {
    border: 1px solid rgba(100, 116, 139, 0.25);
    background: rgba(56, 189, 248, 0.18);
    color: rgba(15, 23, 42, 0.9);
    padding: 10px 12px;
    border-radius: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 120ms ease, background 140ms ease, border-color 140ms ease;
    user-select: none;
    min-width: 110px;
  }

  .hq-btn:hover {
    transform: translateY(-1px);
    border-color: rgba(56, 189, 248, 0.55);
    background: rgba(56, 189, 248, 0.24);
  }

  .hq-btn:active {
    transform: translateY(0px) scale(0.99);
  }

  .hq-btn--ghost {
    background: rgba(255, 255, 255, 0.5);
  }

  .hq-hint {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(51, 65, 85, 0.75);
    text-align: center;
  }

  /* Dark mode: keep it cute, not neon */
  @media (prefers-color-scheme: dark) {
    #hobby-quest {
      background:
        radial-gradient(1200px 600px at 20% 10%, rgba(56, 189, 248, 0.20), transparent 60%),
        radial-gradient(900px 500px at 80% 20%, rgba(251, 191, 36, 0.18), transparent 55%),
        radial-gradient(900px 700px at 50% 90%, rgba(192, 132, 252, 0.15), transparent 60%),
        linear-gradient(135deg, rgba(2, 6, 23, 1), rgba(15, 23, 42, 1));
    }

    #hobby-quest::before {
      opacity: 0.22;
      mix-blend-mode: screen;
    }

    #hobby-quest::after {
      opacity: 0.08;
    }

    .hq-card {
      background: rgba(15, 23, 42, 0.62);
      border-color: rgba(148, 163, 184, 0.22);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
    }

    .hq-crumbs,
    .hq-hint {
      color: rgba(226, 232, 240, 0.72);
    }

    .hq-title {
      color: rgba(241, 245, 249, 0.92);
    }

    .hq-body {
      color: rgba(226, 232, 240, 0.86);
    }

    .hq-option {
      background: rgba(30, 41, 59, 0.62);
      border-color: rgba(148, 163, 184, 0.2);
      color: rgba(241, 245, 249, 0.92);
    }

    .hq-option:hover {
      border-color: rgba(56, 189, 248, 0.45);
      background: rgba(30, 41, 59, 0.78);
    }

    .hq-option__key {
      background: rgba(2, 6, 23, 0.35);
      border-color: rgba(148, 163, 184, 0.22);
      color: rgba(226, 232, 240, 0.82);
    }

    .hq-btn {
      background: rgba(56, 189, 248, 0.12);
      border-color: rgba(148, 163, 184, 0.22);
      color: rgba(241, 245, 249, 0.92);
    }

    .hq-btn--ghost {
      background: rgba(2, 6, 23, 0.28);
    }
  }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .hq-card,
    .hq-option,
    .hq-btn {
      transition: none !important;
    }
  }
</style>

<script src="{{ '/assets/js/hobbies-quest.js' | relative_url }}"></script>



