/* assets/js/pcb-masthead.js
 */

(() => {
  "use strict";

  const masthead = document.querySelector("[data-pcb-masthead]");
  if (!masthead) return;

  const svg = masthead.querySelector(".pcb-masthead__traces");
  if (!svg) return;

  const cpu = masthead.querySelector("#pcb-cpu");
  const cpuFace = masthead.querySelector(".pcb-cpu__face");

  const SVG_NS = "http://www.w3.org/2000/svg";
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    ioMap: new Map(),
    nets: new Map(), // id -> { g, end:{x,y}, vias:[] }
    hoverId: null,
    activeId: null,
    inView: true,

    decorG: null,
    sparkLayer: null,

    layoutRaf: 0,
    idleInterval: 0,
    awakeTimer: 0,
    blinkTimer: 0,

    parallaxRaf: 0,
    lastPointer: null
  };

  // ---------- Helpers ----------
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Snap to 0.5px to reduce blur on thin strokes
  const snap = (n) => Math.round(n * 2) / 2;

  function svgEl(name, attrs = {}, className = "") {
    const el = document.createElementNS(SVG_NS, name);
    if (className) el.setAttribute("class", className);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  function clearSvg(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function wakeFor(ms = 1400) {
    masthead.classList.add("is-awake");
    window.clearTimeout(state.awakeTimer);
    state.awakeTimer = window.setTimeout(() => {
      masthead.classList.remove("is-awake");
    }, ms);
  }

  function normalizePath(urlLike) {
    try {
      const u = new URL(urlLike, window.location.origin);
      let p = (u.pathname || "/").replace(/\/+/g, "/");
      if (p.length > 1) p = p.replace(/\/$/, "");
      return p;
    } catch {
      return null;
    }
  }

  function currentPath() {
    let p = (window.location.pathname || "/").replace(/\/+/g, "/");
    if (p.length > 1) p = p.replace(/\/$/, "");
    return p;
  }

  function pickActiveFromLocation(ioMap) {
    const here = currentPath();
    for (const [id, el] of ioMap.entries()) {
      if (!el || el.tagName !== "A") continue;
      const href = el.getAttribute("href");
      if (!href) continue;
      const p = normalizePath(href);
      if (p && p === here) return id;
    }
    return null;
  }

  // Collect visible .pcb-io elements (greedy-nav may duplicate/move)
  function collectVisibleIO() {
    const all = Array.from(masthead.querySelectorAll(".pcb-io[data-pcb-id]"));
    const byId = new Map();

    for (const el of all) {
      const id = el.dataset.pcbId;
      if (!id) continue;

      const isVisible = !!(el.offsetParent);
      if (!byId.has(id)) {
        byId.set(id, el);
      } else {
        const prev = byId.get(id);
        const prevVisible = !!(prev && prev.offsetParent);
        if (!prevVisible && isVisible) byId.set(id, el);
      }
    }
    return byId;
  }

  function pointForIO(ioEl, mastRect) {
    const r = ioEl.getBoundingClientRect();
    const isIcon = ioEl.classList.contains("pcb-io--icon");

    // normal links: "LED dot" is left side; icon button: dot is on right side
    const x = isIcon
      ? (r.right - mastRect.left) + 10
      : (r.left - mastRect.left) - 10;

    const y = (r.top - mastRect.top) + (r.height * 0.5);
    return { x: snap(clamp(x, 0, mastRect.width)), y: snap(clamp(y, 0, mastRect.height)) };
  }

  function cpuPins(cpuEl, mastRect, n) {
    // Generates N pin points along the CPU right edge
    if (!cpuEl || n <= 0) {
      const fallbackY = mastRect.height * 0.5;
      return Array.from({ length: n }, () => ({
        x: snap(40),
        y: snap(fallbackY)
      }));
    }

    const r = cpuEl.getBoundingClientRect();

    const pinX = (r.right - mastRect.left) + 8;

    // Keep pins inside a “safe band” so they look like chip pins
    const top = (r.top - mastRect.top) + r.height * 0.20;
    const bot = (r.top - mastRect.top) + r.height * 0.80;

    const pins = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      pins.push({
        x: snap(clamp(pinX, 0, mastRect.width)),
        y: snap(clamp(lerp(top, bot, t), 0, mastRect.height))
      });
    }
    return pins;
  }

  // Manhattan-ish routing through a laneX to keep traces separated
  function routeLane(start, end, laneX, w) {
    const sx = start.x, sy = start.y;
    const ex = end.x, ey = end.y;

    const dx = ex - sx;
    const dy = ey - sy;

    // If not enough horizontal room, fall back to a smooth bezier
    if (dx < 120) {
      const c1x = sx + dx * 0.35;
      const c2x = sx + dx * 0.65;
      return `M ${sx} ${sy} C ${snap(c1x)} ${sy}, ${snap(c2x)} ${ey}, ${ex} ${ey}`;
    }

    const r = 12; // corner radius
    const sign = (dy >= 0) ? 1 : -1;

    const minLane = sx + 40;
    const maxLane = ex - 40;
    const lx = snap(clamp(laneX, minLane, maxLane));

    // If vertical move is tiny, keep it mostly horizontal
    if (Math.abs(dy) < (r * 2 + 6)) {
      return `M ${sx} ${sy} L ${lx} ${sy} L ${ex} ${ey}`;
    }

    const x1 = snap(lx - r);
    const y2 = snap(ey - sign * r);
    const yCorner1 = snap(sy + sign * r);
    const xCorner2 = snap(lx + r);

    return [
      `M ${sx} ${sy}`,
      `L ${x1} ${sy}`,
      `Q ${lx} ${sy} ${lx} ${yCorner1}`,
      `L ${lx} ${y2}`,
      `Q ${lx} ${ey} ${xCorner2} ${ey}`,
      `L ${ex} ${ey}`
    ].join(" ");
  }

  function addDefs(svgRoot) {
    const defs = svgEl("defs");

    // Safer than rgba() in attributes: use stop-opacity
    const copperGold = svgEl("linearGradient", {
      id: "pcbCopperGold",
      x1: "0%", y1: "0%",
      x2: "100%", y2: "0%"
    });

    copperGold.appendChild(svgEl("stop", {
      offset: "0%",
      "stop-color": "#d68446",
      "stop-opacity": "0.95"
    }));
    copperGold.appendChild(svgEl("stop", {
      offset: "55%",
      "stop-color": "#ffd778",
      "stop-opacity": "0.92"
    }));
    copperGold.appendChild(svgEl("stop", {
      offset: "100%",
      "stop-color": "#d68446",
      "stop-opacity": "0.80"
    }));

    const goldHot = svgEl("linearGradient", {
      id: "pcbGoldHot",
      x1: "0%", y1: "0%",
      x2: "100%", y2: "0%"
    });

    goldHot.appendChild(svgEl("stop", {
      offset: "0%",
      "stop-color": "#ffd778",
      "stop-opacity": "0.00"
    }));
    goldHot.appendChild(svgEl("stop", {
      offset: "45%",
      "stop-color": "#fff0be",
      "stop-opacity": "0.95"
    }));
    goldHot.appendChild(svgEl("stop", {
      offset: "100%",
      "stop-color": "#ffd778",
      "stop-opacity": "0.00"
    }));

    const padFill = svgEl("radialGradient", {
      id: "pcbPadFill",
      cx: "40%",
      cy: "35%",
      r: "70%"
    });

    padFill.appendChild(svgEl("stop", {
      offset: "0%",
      "stop-color": "#fff0be",
      "stop-opacity": "0.92"
    }));
    padFill.appendChild(svgEl("stop", {
      offset: "70%",
      "stop-color": "#ffd778",
      "stop-opacity": "0.62"
    }));
    padFill.appendChild(svgEl("stop", {
      offset: "100%",
      "stop-color": "#d68446",
      "stop-opacity": "0.35"
    }));

    defs.appendChild(copperGold);
    defs.appendChild(goldHot);
    defs.appendChild(padFill);
    svgRoot.appendChild(defs);
  }

  function buildDecor(svgRoot, w, h) {
    const decor = svgEl("g", {}, "pcb-decor");
    state.decorG = decor;

    // Bottom “bus” (purely decorative)
    const busY = snap(h * 0.86);
    const dBus = `M ${snap(w * 0.06)} ${busY}
                  C ${snap(w * 0.22)} ${snap(busY - 8)}, ${snap(w * 0.38)} ${snap(busY + 10)}, ${snap(w * 0.54)} ${busY}
                  S ${snap(w * 0.82)} ${snap(busY - 8)}, ${snap(w * 0.94)} ${busY}`;

    const bus = svgEl("g", {}, "pcb-bus");
    bus.appendChild(svgEl("path", { d: dBus }, "pcb-bus pcb-bus--base"));
    bus.appendChild(svgEl("path", { d: dBus }, "pcb-bus pcb-bus--gold"));
    const sig = svgEl("path", { d: dBus }, "pcb-bus pcb-bus--signal is-pulse");
    sig.style.setProperty("--bus-speed", `${900 + Math.random() * 900}ms`);
    bus.appendChild(sig);

    decor.appendChild(bus);

    // Cute silkscreen components
    const comps = [
      { x: w * 0.18, y: h * 0.70, ww: 36, hh: 14, label: "R1" },
      { x: w * 0.34, y: h * 0.62, ww: 44, hh: 16, label: "C3" },
      { x: w * 0.56, y: h * 0.72, ww: 40, hh: 14, label: "U2" },
      { x: w * 0.74, y: h * 0.62, ww: 52, hh: 16, label: "LDO" }
    ];

    for (const c of comps) {
      decor.appendChild(svgEl("rect", {
        x: snap(c.x), y: snap(c.y),
        width: snap(c.ww), height: snap(c.hh)
      }, "pcb-component"));

      const t = svgEl("text", { x: snap(c.x + c.ww * 0.5), y: snap(c.y - 8) }, "pcb-label");
      t.textContent = c.label;
      decor.appendChild(t);
    }

    svgRoot.appendChild(decor);
  }

  function buildSparksLayer(svgRoot) {
    const sparks = svgEl("g", {}, "pcb-sparks");
    svgRoot.appendChild(sparks);
    state.sparkLayer = sparks;
  }

  function heartPath(size = 10) {
    const s = size;
    return [
      `M 0 ${-s * 0.25}`,
      `C 0 ${-s * 0.75} ${-s} ${-s * 0.75} ${-s} ${-s * 0.10}`,
      `C ${-s} ${s * 0.40} ${-s * 0.40} ${s * 0.65} 0 ${s}`,
      `C ${s * 0.40} ${s * 0.65} ${s} ${s * 0.40} ${s} ${-s * 0.10}`,
      `C ${s} ${-s * 0.75} 0 ${-s * 0.75} 0 ${-s * 0.25}`,
      "Z"
    ].join(" ");
  }

  function spawnSparks(x, y, kind = "star", count = 6) {
    if (!state.sparkLayer) return;
    if (prefersReducedMotion) return;

    for (let i = 0; i < count; i++) {
      const holder = svgEl("g", { transform: `translate(${x} ${y})` });

      const dx = (Math.random() * 42 - 21);
      const dy = -(8 + Math.random() * 30);
      const rot = (60 + Math.random() * 140) + "deg";
      const life = (700 + Math.random() * 520) + "ms";

      let shape;
      if (kind === "heart") {
        shape = svgEl("path", { d: heartPath(5.2) }, "pcb-spark pcb-spark--heart");
        shape.style.setProperty("--spark-fill", "var(--pcb-spark-pink)");
      } else {
        shape = svgEl("path", { d: "M 0 -4 L 4 0 L 0 4 L -4 0 Z" }, "pcb-spark");
      }

      shape.style.setProperty("--dx", `${dx}px`);
      shape.style.setProperty("--dy", `${dy}px`);
      shape.style.setProperty("--rot", rot);
      shape.style.setProperty("--spark-life", life);

      holder.appendChild(shape);
      state.sparkLayer.appendChild(holder);

      requestAnimationFrame(() => shape.classList.add("is-pop"));
      window.setTimeout(() => holder.remove(), 1400);
    }
  }

  function blinkViasRun(net) {
    if (!net || !net.vias || prefersReducedMotion) return;
    const vias = net.vias;

    vias.forEach(v => v.classList.remove("is-blink"));
    vias.forEach((via, i) => {
      window.setTimeout(() => {
        via.classList.add("is-blink");
        window.setTimeout(() => via.classList.remove("is-blink"), 1800);
      }, i * 120);
    });
  }

  function buildNet(parent, id, d, end, opts = {}) {
    const g = svgEl("g", {}, "pcb-net");
    g.dataset.pcbId = id;

    if (opts.playful) g.classList.add("is-playful");
    g.style.setProperty("--trace-speed", opts.speed || `${780 + Math.random() * 620}ms`);
    if (opts.color) g.style.setProperty("--trace-color", opts.color);

    const base = svgEl("path", { d }, "pcb-trace--base");
    const hi = svgEl("path", { d }, "pcb-trace--highlight");
    const sig = svgEl("path", { d }, "pcb-trace--signal");

    g.appendChild(base);
    g.appendChild(hi);
    g.appendChild(sig);

    // Vias placed at the two “corners” and near the end (helps the PCB vibe)
    const vias = [];
    if (opts.vias && Array.isArray(opts.vias)) {
      for (const pt of opts.vias) {
        const via = svgEl("circle", { cx: pt.x, cy: pt.y, r: 3.1 }, "pcb-via");
        g.appendChild(via);
        vias.push(via);
      }
    }

    parent.appendChild(g);
    state.nets.set(id, { g, end, vias });
    return g;
  }

  function displayedId() {
    return state.hoverId || state.activeId;
  }

  function applyActiveVisuals() {
    const id = displayedId();

    for (const [key, el] of state.ioMap.entries()) {
      if (!el) continue;
      el.classList.toggle("is-active", key === id);
    }

    for (const [key, meta] of state.nets.entries()) {
      meta.g.classList.toggle("is-active", key === id);
    }
  }

  function setHover(id) {
    state.hoverId = id;
    wakeFor(1400);
    applyActiveVisuals();

    const net = state.nets.get(id);
    if (net) {
      blinkViasRun(net);
      spawnSparks(net.end.x, net.end.y, "star", 6);
    }
  }

  function clearHover() {
    state.hoverId = null;
    applyActiveVisuals();
  }

  // ---------- Build / Layout ----------
  function rebuild() {
    const mastRect = masthead.getBoundingClientRect();
    const w = Math.max(1, Math.floor(mastRect.width));
    const h = Math.max(1, Math.floor(mastRect.height));

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    clearSvg(svg);
    state.nets.clear();
    state.ioMap = collectVisibleIO();

    addDefs(svg);
    buildDecor(svg, w, h);

    const tracesGroup = svgEl("g", {}, "pcb-traces");
    svg.appendChild(tracesGroup);

    // Targets (endpoints)
    const targets = [];
    for (const [id, el] of state.ioMap.entries()) {
      const end = pointForIO(el, mastRect);
      targets.push({ id, el, end });
    }

    // Sort by Y so “pin assignment” follows visual order (reduces crossings)
    targets.sort((a, b) => a.end.y - b.end.y);

    // CPU pins
    const pins = cpuPins(cpu, mastRect, targets.length);

    // Draw pin pads (cute CPU pins)
    pins.forEach((p) => {
      const pad = svgEl("circle", { cx: p.x, cy: p.y, r: 3.8 }, "pcb-pad");
      tracesGroup.appendChild(pad);
    });

    // Lane settings: this is the key part that prevents traces stacking inside each other
    const cpuRect = cpu ? cpu.getBoundingClientRect() : null;
    const baseX = cpuRect ? (cpuRect.right - mastRect.left) + 8 : 50;

    const laneCenter = baseX + clamp(w * 0.18, 80, 170);
    const laneSpacing = clamp(w * 0.012, 6, 11);

    // Build each net
    targets.forEach((t, i) => {
      const start = pins[i];              // each link gets its own CPU pin
      const end = t.end;

      // spread laneX so vertical segments don't overlap
      const laneX = laneCenter + (i - (targets.length - 1) / 2) * laneSpacing;

      const d = routeLane(start, end, laneX, w);

      // Vias at lane corners + end pad
      const corner1 = { x: snap(clamp(laneX, start.x + 40, end.x - 40)), y: start.y };
      const corner2 = { x: corner1.x, y: end.y };
      const vias = [corner1, corner2];

      const playful = (i % 3 === 0);
      const color = playful ? "var(--pcb-signal-2)" : "var(--pcb-signal)";

      buildNet(tracesGroup, t.id, d, end, {
        playful,
        color,
        vias
      });

      // End pad near the component LED
      const endPad = svgEl("circle", { cx: end.x, cy: end.y, r: 4.6 }, "pcb-pad");
      tracesGroup.appendChild(endPad);
    });

    buildSparksLayer(svg);

    // Active link based on current URL
    state.activeId = pickActiveFromLocation(state.ioMap);
    applyActiveVisuals();
  }

  function scheduleRebuild() {
    if (state.layoutRaf) return;
    state.layoutRaf = requestAnimationFrame(() => {
      state.layoutRaf = 0;
      rebuild();
    });
  }

  // ---------- Idle pulses ----------
  function startIdlePulses() {
    stopIdlePulses();
    if (prefersReducedMotion) return;

    state.idleInterval = window.setInterval(() => {
      if (!state.inView) return;

      const keys = Array.from(state.nets.keys());
      if (!keys.length) return;

      const avoid = displayedId();
      let pick = keys[Math.floor(Math.random() * keys.length)];
      if (pick === avoid && keys.length > 1) {
        pick = keys[(keys.indexOf(pick) + 1) % keys.length];
      }

      const meta = state.nets.get(pick);
      if (!meta) return;

      meta.g.classList.add("is-idle");
      window.setTimeout(() => meta.g.classList.remove("is-idle"), 1400);

      if (Math.random() < 0.25) spawnSparks(meta.end.x, meta.end.y, "star", 5);
    }, 1900);
  }

  function stopIdlePulses() {
    if (state.idleInterval) window.clearInterval(state.idleInterval);
    state.idleInterval = 0;
  }

  // ---------- Cute random CPU face blink ----------
  function startRandomBlink() {
    stopRandomBlink();
    if (!cpuFace || prefersReducedMotion) return;

    const loop = () => {
      if (!state.inView) {
        state.blinkTimer = window.setTimeout(loop, 1200);
        return;
      }

      const wait = 4200 + Math.random() * 5200;
      state.blinkTimer = window.setTimeout(() => {
        cpuFace.classList.add("is-blink");
        window.setTimeout(() => cpuFace.classList.remove("is-blink"), 520);
        loop();
      }, wait);
    };
    loop();
  }

  function stopRandomBlink() {
    if (state.blinkTimer) window.clearTimeout(state.blinkTimer);
    state.blinkTimer = 0;
  }

  // ---------- Optional parallax (DECOR ONLY, not traces) ----------
  function applyDecorParallax() {
    state.parallaxRaf = 0;
    if (!state.lastPointer || !state.decorG) return;

    const r = masthead.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const nx = clamp((state.lastPointer.x - cx) / (r.width / 2), -1, 1);
    const ny = clamp((state.lastPointer.y - cy) / (r.height / 2), -1, 1);

    const dx = snap(nx * 6);
    const dy = snap(ny * 4);

    state.decorG.setAttribute("transform", `translate(${dx} ${dy})`);
  }

  function onPointerMove(ev) {
    if (prefersReducedMotion) return;
    if (!state.inView) return;

    state.lastPointer = { x: ev.clientX, y: ev.clientY };
    if (!state.parallaxRaf) state.parallaxRaf = requestAnimationFrame(applyDecorParallax);
  }

  function resetDecorParallax() {
    if (state.decorG) state.decorG.setAttribute("transform", "translate(0 0)");
  }

  // ---------- Events ----------
  function wireEvents() {
    // Hover/focus interactions
    masthead.addEventListener("pointerover", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;
      setHover(io.dataset.pcbId);
    });

    masthead.addEventListener("pointerout", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;

      const to = ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest(".pcb-io[data-pcb-id]");
      if (to) return;

      clearHover();
    });

    masthead.addEventListener("focusin", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;
      setHover(io.dataset.pcbId);
    });

    masthead.addEventListener("focusout", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;
      clearHover();
    });

    // Click sparks (cute)
    masthead.addEventListener("pointerdown", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (io) {
        const id = io.dataset.pcbId;
        const net = state.nets.get(id);
        if (net) spawnSparks(net.end.x, net.end.y, "heart", 7);
        wakeFor(1800);
      }
    });

    // Decor parallax only
    masthead.addEventListener("pointermove", onPointerMove);
    masthead.addEventListener("pointerleave", () => {
      state.lastPointer = null;
      resetDecorParallax();
    });
  }

  function wireObservers() {
    // Rebuild when masthead size changes
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => scheduleRebuild());
      ro.observe(masthead);
    } else {
      window.addEventListener("resize", scheduleRebuild);
    }

    // Greedy-nav changes DOM when it hides/shows links
    if ("MutationObserver" in window) {
      const nav = masthead.querySelector("#site-nav") || masthead;
      const mo = new MutationObserver(() => scheduleRebuild());
      mo.observe(nav, { childList: true, subtree: true });
    }

    // Stop idle animation when not visible
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        state.inView = !!(entries[0] && entries[0].isIntersecting);
        if (!state.inView) {
          stopIdlePulses();
          resetDecorParallax();
        } else {
          startIdlePulses();
        }
      }, { threshold: 0.05 });

      io.observe(masthead);
    }
  }

  // ---------- Init ----------
  rebuild();
  wireEvents();
  wireObservers();
  startIdlePulses();
  startRandomBlink();

  // Rebuild again after full load (fonts/layout settle)
  window.addEventListener("load", () => scheduleRebuild());
  window.setTimeout(scheduleRebuild, 250);
})();

