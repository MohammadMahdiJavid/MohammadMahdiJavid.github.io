---
layout: single
title: "Hobbies"
permalink: /hobbies/
---

<div class="hb-page">

  <div class="hb-hero">
    <div class="hb-hero__text">
      <h2 class="hb-hero__title">My “after hours” embedded & hardware lab</h2>
      <p class="hb-hero__lead">
        When I’m not working, I usually end up doing something that still smells like a datasheet:
        bringing up sensors, writing firmware, debugging buses, or exploring how security and safety
        show up in real microcontroller systems.
      </p>
      <ul class="hb-hero__bullets">
        <li><strong>Embedded firmware:</strong> bare‑metal drivers, timing, RTOS patterns, interfaces (I²C/SPI/UART/CAN).</li>
        <li><strong>Hardware development:</strong> breadboards → schematics/PCB, soldering, measurement & bring‑up.</li>
        <li><strong>Security × hardware:</strong> firmware reverse‑engineering and “how would I harden this?” thinking.</li>
      </ul>

      <p class="hb-hero__hint">
        This page is intentionally <em>job‑relevant</em>: it shows how I learn, build, and debug outside of work.
        (Click around the map below — each node explains the “why it matters”.)
      </p>
    </div>

    <div class="hb-hero__chips" aria-label="Topics I enjoy">
      <span class="hb-chip">Bare‑metal C</span>
      <span class="hb-chip">MCU peripherals</span>
      <span class="hb-chip">Debugging</span>
      <span class="hb-chip">PCB & soldering</span>
      <span class="hb-chip">CAN / automotive</span>
      <span class="hb-chip">Secure boot</span>
      <span class="hb-chip">ISO 26262 mindset</span>
      <span class="hb-chip">Firmware RE</span>
    </div>
  </div>


  <div class="hb-bento" aria-label="Hobbies at a glance">
    <div class="hb-card">
      <div class="hb-card__title">🔧 Microcontrollers</div>
      <div class="hb-card__text">Dev boards, register-level bring‑up, peripheral experiments, and clean driver structure.</div>
      <div class="hb-card__tags">
        <span class="hb-tag">GPIO</span><span class="hb-tag">Timers</span><span class="hb-tag">DMA</span><span class="hb-tag">SPI/I²C</span>
      </div>
    </div>

    <div class="hb-card">
      <div class="hb-card__title">🧪 Debug & measurement</div>
      <div class="hb-card__text">I enjoy finding “why it fails”: logic analyzer traces, scope measurements, and systematic isolation.</div>
      <div class="hb-card__tags">
        <span class="hb-tag">JTAG/SWD</span><span class="hb-tag">Oscilloscope</span><span class="hb-tag">LA</span><span class="hb-tag">Profiling</span>
      </div>
    </div>

    <div class="hb-card">
      <div class="hb-card__title">🛠️ Hardware prototyping</div>
      <div class="hb-card__text">From quick prototypes to “make it real”: schematics, PCB, soldering, and rework.</div>
      <div class="hb-card__tags">
        <span class="hb-tag">KiCad</span><span class="hb-tag">BOM</span><span class="hb-tag">Soldering</span><span class="hb-tag">Bring‑up</span>
      </div>
    </div>

    <div class="hb-card">
      <div class="hb-card__title">🔐 Hardware security</div>
      <div class="hb-card__text">Firmware analysis + hardware curiosity. Mostly: “what could go wrong and how do we defend?”</div>
      <div class="hb-card__tags">
        <span class="hb-tag">Firmware RE</span><span class="hb-tag">Secure boot</span><span class="hb-tag">Crypto</span><span class="hb-tag">Threat modeling</span>
      </div>
    </div>

    <div class="hb-card">
      <div class="hb-card__title">🚗 Automotive mindset</div>
      <div class="hb-card__text">I like safety + security concepts where embedded decisions matter (robustness, traceability, constraints).</div>
      <div class="hb-card__tags">
        <span class="hb-tag">ISO 26262</span><span class="hb-tag">CAN</span><span class="hb-tag">Faults</span><span class="hb-tag">Resilience</span>
      </div>
    </div>

    <div class="hb-card">
      <div class="hb-card__title">📚 Learning & notes</div>
      <div class="hb-card__text">Reading datasheets/errata and turning them into small experiments + notes I can reuse later.</div>
      <div class="hb-card__tags">
        <span class="hb-tag">Datasheets</span><span class="hb-tag">Errata</span><span class="hb-tag">Write‑ups</span><span class="hb-tag">Labs</span>
      </div>
    </div>
  </div>


  <h2 id="interactive-map">Interactive hobby map</h2>
  <p class="hb-sublead">
    Click a node to see details. Use the filter to quickly highlight topics (try: <em>CAN</em>, <em>RTOS</em>, <em>KiCad</em>, <em>secure boot</em>).
  </p>

  <div class="hb-layout">
    <div class="hb-left">
      <div class="hb-controls" aria-label="Hobby map controls">
        <button class="hb-btn" id="hobbies-reset" type="button">Reset</button>
        <button class="hb-btn" id="hobbies-fit" type="button">Fit</button>
        <button class="hb-btn hb-btn--primary" id="hobbies-png" type="button">Download PNG</button>

        <div class="hb-search">
          <input
            id="hobbies-search"
            class="hb-input"
            type="text"
            inputmode="search"
            autocomplete="off"
            placeholder="Filter nodes… (e.g., CAN, RTOS, SPI, secure boot)" />
          <div id="hobbies-search-status" class="hb-search__status" aria-live="polite"></div>
        </div>
      </div>

      <div class="hb-graph-wrap">
        <div
          id="hobbies-flowchart"
          class="hb-graph"
          role="application"
          aria-label="Interactive hobby map"></div>
        <div id="hobbies-tooltip" class="hb-tooltip" aria-hidden="true"></div>
      </div>

      <p class="hb-tip">
        Tip: drag to pan, scroll/pinch to zoom. On mobile, tapping a node also zooms to it.
      </p>
    </div>

    <aside class="hb-right" aria-label="Selected hobby details">
      <div class="hb-panel">
        <div class="hb-panel__header">
          <div class="hb-panel__kicker">Details</div>
          <h3 id="hobby-title" class="hb-panel__title">Click a node 👈</h3>
        </div>
        <div id="hobby-body" class="hb-panel__body"></div>
      </div>

      <div class="hb-panel hb-panel--small">
        <div class="hb-panel__header">
          <div class="hb-panel__kicker">Hiring‑friendly summary</div>
          <h3 class="hb-panel__title">What these hobbies signal</h3>
        </div>
        <div class="hb-panel__body">
          <ul class="hb-list">
            <li><strong>Comfort with constraints:</strong> timing, memory, peripherals, and “close to the metal” tradeoffs.</li>
            <li><strong>Debugging discipline:</strong> hypothesis → measurement → isolate → fix → document.</li>
            <li><strong>Security awareness:</strong> thinking about trust boundaries and hardening on real devices.</li>
            <li><strong>Systems thinking:</strong> firmware + hardware + tools + process (safety mindset, robustness).</li>
          </ul>
        </div>
      </div>
    </aside>
  </div>


  <noscript>
    <div class="hb-noscript">
      <strong>JavaScript is disabled.</strong>
      Here’s the text version: I enjoy embedded firmware (drivers, RTOS patterns, bus interfaces),
      hardware prototyping (schematics/PCB, soldering, bring‑up), debugging and measurement
      (JTAG/SWD, logic analyzer, oscilloscope), and hardware/firmware security concepts
      (firmware analysis, secure boot, threat modeling).
    </div>
  </noscript>

</div>


<style>
  /* ===== Page-scoped styling (keeps the rest of the site untouched) ===== */
  .hb-page {
    --hb-bg: #ffffff;
    --hb-text: #0f172a;
    --hb-muted: #475569;
    --hb-border: rgba(2, 6, 23, 0.12);
    --hb-card: rgba(255, 255, 255, 0.72);
    --hb-card-solid: #ffffff;
    --hb-shadow: 0 12px 30px rgba(2, 6, 23, 0.08);
    --hb-accent: #0284c7; /* sky-600 */
    --hb-accent-2: #7c3aed; /* violet-600 */
    --hb-good: #16a34a;
    --hb-warn: #ca8a04;
  }

  @media (prefers-color-scheme: dark) {
    .hb-page {
      --hb-bg: #0b1220;
      --hb-text: #e5e7eb;
      --hb-muted: #a1a1aa;
      --hb-border: rgba(226, 232, 240, 0.14);
      --hb-card: rgba(15, 23, 42, 0.62);
      --hb-card-solid: #0f172a;
      --hb-shadow: 0 18px 40px rgba(0, 0, 0, 0.4);
      --hb-accent: #38bdf8; /* sky-400 */
      --hb-accent-2: #a78bfa; /* violet-400 */
      --hb-good: #22c55e;
      --hb-warn: #facc15;
    }
  }

  .hb-page :is(h2, h3) { color: var(--hb-text); }
  .hb-page p { color: var(--hb-muted); }

  .hb-hero {
    position: relative;
    border: 1px solid var(--hb-border);
    border-radius: 18px;
    padding: 22px;
    margin: 4px 0 22px;
    background:
      radial-gradient(1200px 400px at 12% 0%, rgba(2, 132, 199, 0.16), transparent 55%),
      radial-gradient(1200px 420px at 78% 10%, rgba(124, 58, 237, 0.16), transparent 55%),
      linear-gradient(180deg, var(--hb-card), var(--hb-card-solid));
    box-shadow: var(--hb-shadow);
    overflow: hidden;
  }

  /* subtle “circuit-ish” pattern */
  .hb-hero::before {
    content: "";
    position: absolute;
    inset: -40px;
    background-image:
      linear-gradient(to right, rgba(148, 163, 184, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(148, 163, 184, 0.10) 1px, transparent 1px);
    background-size: 36px 36px;
    mask-image: radial-gradient(closest-side, rgba(0,0,0,0.55), transparent 80%);
    pointer-events: none;
  }

  .hb-hero__title {
    margin: 0 0 10px;
    letter-spacing: -0.02em;
  }

  .hb-hero__lead { margin: 0 0 12px; }
  .hb-hero__bullets { margin: 0 0 10px 18px; }
  .hb-hero__bullets li { margin: 6px 0; color: var(--hb-muted); }
  .hb-hero__hint { margin: 12px 0 0; font-size: 0.98em; }

  .hb-hero__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .hb-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid var(--hb-border);
    background: rgba(255, 255, 255, 0.55);
    color: var(--hb-text);
    font-size: 0.92em;
    white-space: nowrap;
  }
  @media (prefers-color-scheme: dark) {
    .hb-chip { background: rgba(2, 6, 23, 0.28); }
  }

  .hb-bento {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    margin: 18px 0 28px;
  }

  @media (min-width: 760px) {
    .hb-bento { grid-template-columns: 1fr 1fr; }
  }

  .hb-card {
    border: 1px solid var(--hb-border);
    border-radius: 16px;
    padding: 14px 14px 12px;
    background: linear-gradient(180deg, var(--hb-card), var(--hb-card-solid));
    box-shadow: 0 10px 26px rgba(2, 6, 23, 0.06);
    transition: transform 160ms ease, box-shadow 160ms ease;
  }

  .hb-card__title {
    font-weight: 700;
    color: var(--hb-text);
    margin-bottom: 6px;
  }

  .hb-card__text { color: var(--hb-muted); margin-bottom: 10px; }

  .hb-card__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .hb-tag {
    font-size: 0.86em;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid var(--hb-border);
    color: var(--hb-text);
    background: rgba(2, 132, 199, 0.06);
  }
  @media (prefers-color-scheme: dark) {
    .hb-tag { background: rgba(56, 189, 248, 0.10); }
  }

  .hb-card:hover { transform: translateY(-2px); box-shadow: 0 16px 38px rgba(2, 6, 23, 0.10); }

  @media (prefers-reduced-motion: reduce) {
    .hb-card { transition: none; }
    .hb-card:hover { transform: none; }
  }

  .hb-sublead { margin-top: -6px; }

  .hb-layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    align-items: start;
    margin-top: 12px;
  }
  @media (min-width: 980px) {
    .hb-layout { grid-template-columns: 1.35fr 0.65fr; }
  }

  .hb-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    padding: 10px;
    border: 1px solid var(--hb-border);
    border-radius: 14px;
    background: linear-gradient(180deg, var(--hb-card), var(--hb-card-solid));
    box-shadow: 0 10px 26px rgba(2, 6, 23, 0.06);
  }

  .hb-btn {
    appearance: none;
    border: 1px solid var(--hb-border);
    background: rgba(255,255,255,0.7);
    border-radius: 12px;
    padding: 8px 10px;
    cursor: pointer;
    color: var(--hb-text);
    font-weight: 600;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .hb-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 18px rgba(2, 6, 23, 0.10); }
  .hb-btn--primary {
    border-color: rgba(2, 132, 199, 0.35);
    background: linear-gradient(90deg, rgba(2, 132, 199, 0.18), rgba(124, 58, 237, 0.16));
  }

  .hb-search { flex: 1 1 320px; min-width: 220px; }
  .hb-input {
    width: 100%;
    border: 1px solid var(--hb-border);
    border-radius: 12px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.72);
    color: var(--hb-text);
  }
  @media (prefers-color-scheme: dark) {
    .hb-btn { background: rgba(2, 6, 23, 0.34); }
    .hb-input { background: rgba(2, 6, 23, 0.34); }
  }

  .hb-search__status { margin-top: 6px; font-size: 0.86em; color: var(--hb-muted); }

  .hb-graph-wrap {
    position: relative;
    margin-top: 12px;
    border-radius: 18px;
    border: 1px solid var(--hb-border);
    background: linear-gradient(180deg, var(--hb-card), var(--hb-card-solid));
    box-shadow: var(--hb-shadow);
    overflow: hidden;
  }

  .hb-graph {
    height: clamp(440px, 68vh, 680px);
    width: 100%;
  }

  .hb-tooltip {
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(-9999px, -9999px);
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid var(--hb-border);
    background: rgba(255,255,255,0.92);
    box-shadow: 0 12px 24px rgba(2, 6, 23, 0.14);
    font-size: 0.92em;
    color: var(--hb-text);
    pointer-events: none;
    max-width: 260px;
    z-index: 5;
  }
  @media (prefers-color-scheme: dark) {
    .hb-tooltip { background: rgba(2, 6, 23, 0.86); }
  }

  .hb-tip { margin-top: 10px; font-size: 0.94em; }

  .hb-panel {
    border: 1px solid var(--hb-border);
    border-radius: 18px;
    background: linear-gradient(180deg, var(--hb-card), var(--hb-card-solid));
    box-shadow: var(--hb-shadow);
    overflow: hidden;
  }
  .hb-panel--small { margin-top: 14px; }

  .hb-panel__header { padding: 14px 14px 0; }
  .hb-panel__kicker { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.75em; color: var(--hb-muted); }
  .hb-panel__title { margin: 6px 0 0; }
  .hb-panel__body { padding: 10px 14px 14px; color: var(--hb-muted); }

  .hb-list { margin: 0 0 0 18px; }
  .hb-list li { margin: 8px 0; }

  .hb-noscript {
    margin-top: 12px;
    padding: 12px 14px;
    border: 1px dashed var(--hb-border);
    border-radius: 16px;
    background: rgba(2, 132, 199, 0.06);
    color: var(--hb-muted);
  }

  /* Make the Cytoscape canvas feel “grabbable” */
  #hobbies-flowchart,
  #hobbies-flowchart canvas { cursor: grab; }
  #hobbies-flowchart.hb-grabbing,
  #hobbies-flowchart.hb-grabbing canvas { cursor: grabbing; }
</style>


<!-- Cytoscape (graph) — loaded only on this page for performance -->
<script defer src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/cytoscape@3.33.1/dist/cytoscape.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>

<!-- Page logic -->
<script defer src="{{ '/assets/js/hobbies.js' | relative_url }}"></script>
