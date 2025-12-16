/* assets/js/pcb-masthead.js */

(() => {
  "use strict";

  const masthead = document.querySelector("[data-pcb-masthead]");
  if (!masthead) return;

  if (masthead.dataset.pcbMastheadInit === "1") return;
  masthead.dataset.pcbMastheadInit = "1";

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
    nets: new Map(),   // id -> { g, end:{x,y}, vias:[], busKey }
    buses: new Map(),  // key -> { g, y, x0, x1 }

    hoverId: null,
    activeId: null,
    inView: true,

    decorG: null,
    sparkLayer: null,

    layoutRaf: 0,
    rebuildTimer: 0,
    rebuilding: false,
    idleInterval: 0,
    awakeTimer: 0,
    blinkTimer: 0,
  };

  // ---------- Small math helpers ----------
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const snap = (n) => Math.round(n * 2) / 2; // 0.5px snapping helps crisp strokes

  // CPU pin tuning (prevents overlap + looks more like real pins)
  const CPU_PIN_R = 3.4;          // smaller than before (3.75)
  const CPU_PIN_OUT = 10;         // distance outside CPU box
  const CPU_PIN_INSET = 0.14;     // usable band along edges (wider than before)
  const CPU_PIN_MIN_PITCH = CPU_PIN_R * 2 + 0.35; // must be > diameter to avoid overlap


  // ---------- SVG helpers ----------
  function svgEl(name, attrs = {}, className = "") {
    const el = document.createElementNS(SVG_NS, name);
    if (className) el.setAttribute("class", className);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  function clearSvg(node) {
    // Much faster than looping removeChild() and reduces mutation churn
    if (node && typeof node.replaceChildren === "function") {
      node.replaceChildren();
      return;
    }
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function wakeFor(ms = 1400) {
    masthead.classList.add("is-awake");
    window.clearTimeout(state.awakeTimer);
    state.awakeTimer = window.setTimeout(() => {
      masthead.classList.remove("is-awake");
    }, ms);
  }

  // ---------- URL matching for active nav ----------
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

  // ---------- DOM collection ----------
  function collectVisibleIO() {
    const all = Array.from(masthead.querySelectorAll(".pcb-io[data-pcb-id]"));
    const byId = new Map();

    for (const el of all) {
      const id = el.dataset.pcbId;
      if (!id) continue;

      const isVisible = !!el.offsetParent;
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

  function pointForIO(ioEl, mastRect, w, h) {
    const r = ioEl.getBoundingClientRect();
    const isIcon = ioEl.classList.contains("pcb-io--icon");
    const pad = 14; // more space than before → cleaner look

    const x = isIcon
      ? (r.right - mastRect.left) + pad
      : (r.left - mastRect.left) - pad;

    const y = (r.top - mastRect.top) + (r.height * 0.5);

    return {
      x: snap(clamp(x, 0, w)),
      y: snap(clamp(y, 0, h))
    };
  }

  function cpuBox(cpuEl, mastRect, w, h) {
    if (!cpuEl) {
      return { x: snap(w * 0.10), y: snap(h * 0.25), w: snap(w * 0.18), h: snap(h * 0.50) };
    }
    const r = cpuEl.getBoundingClientRect();
    const x = snap(clamp(r.left - mastRect.left, 0, w));
    const y = snap(clamp(r.top - mastRect.top, 0, h));
    const ww = snap(clamp(r.width, 10, w));
    const hh = snap(clamp(r.height, 10, h));
    return { x, y, w: ww, h: hh };
  }

  function cpuPinsPerimeter(box, w, h, counts, opts = {}) {
    const out = opts.out ?? CPU_PIN_OUT;
    const inset = opts.inset ?? CPU_PIN_INSET;
    const minPitch = opts.minPitch ?? CPU_PIN_MIN_PITCH;

    const safeX0 = box.x + box.w * inset;
    const safeX1 = box.x + box.w * (1 - inset);
    const safeY0 = box.y + box.h * inset;
    const safeY1 = box.y + box.h * (1 - inset);

    function fitCount(requested, a0, a1) {
      const L = Math.abs(a1 - a0);
      if (requested <= 0 || L <= 0) return 0;

      // length/(count+1) >= minPitch  => count <= length/minPitch - 1
      const max = Math.max(1, Math.floor(L / minPitch) - 1);
      return Math.max(1, Math.min(requested, max));
    }

    function pinLine(count, a0, a1, fixed, horizontal) {
      if (count <= 0) return [];
      const pts = [];
      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        const v = lerp(a0, a1, t);
        pts.push(horizontal
          ? { x: snap(clamp(v, 0, w)), y: snap(clamp(fixed, 0, h)) }
          : { x: snap(clamp(fixed, 0, w)), y: snap(clamp(v, 0, h)) }
        );
      }
      return pts;
    }

    const topCount    = fitCount(counts.top,    safeX0, safeX1);
    const bottomCount = fitCount(counts.bottom, safeX0, safeX1);
    const leftCount   = fitCount(counts.left,   safeY0, safeY1);
    const rightCount  = fitCount(counts.right,  safeY0, safeY1);

    return {
      top:    pinLine(topCount,    safeX0, safeX1, box.y - out, true),
      right:  pinLine(rightCount,  safeY0, safeY1, box.x + box.w + out, false),
      bottom: pinLine(bottomCount, safeX0, safeX1, box.y + box.h + out, true),
      left:   pinLine(leftCount,   safeY0, safeY1, box.x - out, false)
    };
  }


  // ---------- SVG defs ----------
  function addDefs(svgRoot) {
    const defs = svgEl("defs");

    const copperGold = svgEl("linearGradient", {
      id: "pcbCopperGold", x1: "0%", y1: "0%", x2: "100%", y2: "0%"
    });
    copperGold.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#d68446", "stop-opacity": "0.95" }));
    copperGold.appendChild(svgEl("stop", { offset: "55%", "stop-color": "#ffd778", "stop-opacity": "0.92" }));
    copperGold.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#d68446", "stop-opacity": "0.80" }));

    const goldHot = svgEl("linearGradient", {
      id: "pcbGoldHot", x1: "0%", y1: "0%", x2: "100%", y2: "0%"
    });
    goldHot.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#ffd778", "stop-opacity": "0.00" }));
    goldHot.appendChild(svgEl("stop", { offset: "45%", "stop-color": "#fff0be", "stop-opacity": "0.95" }));
    goldHot.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#ffd778", "stop-opacity": "0.00" }));

    const padFill = svgEl("radialGradient", { id: "pcbPadFill", cx: "40%", cy: "35%", r: "70%" });
    padFill.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#fff0be", "stop-opacity": "0.92" }));
    padFill.appendChild(svgEl("stop", { offset: "70%", "stop-color": "#ffd778", "stop-opacity": "0.62" }));
    padFill.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#d68446", "stop-opacity": "0.35" }));

    defs.appendChild(copperGold);
    defs.appendChild(goldHot);
    defs.appendChild(padFill);
    svgRoot.appendChild(defs);
  }

  // ---------- Decorative silkscreen (parallax-safe) ----------
  function buildSilkscreen(svgRoot, w, h) {
    const g = svgEl("g", {}, "pcb-decor");
    state.decorG = g;

    const comps = [
      { x: w * 0.18, y: h * 0.78, ww: 36, hh: 14, label: "R1" },
      { x: w * 0.34, y: h * 0.70, ww: 44, hh: 16, label: "C3" },
      { x: w * 0.56, y: h * 0.80, ww: 40, hh: 14, label: "U2" },
      { x: w * 0.74, y: h * 0.70, ww: 52, hh: 16, label: "LDO" }
    ];

    for (const c of comps) {
      g.appendChild(svgEl("rect", {
        x: snap(c.x), y: snap(c.y),
        width: snap(c.ww), height: snap(c.hh)
      }, "pcb-component"));

      const t = svgEl("text", { x: snap(c.x + c.ww * 0.5), y: snap(c.y - 8) }, "pcb-label");
      t.textContent = c.label;
      g.appendChild(t);
    }

    svgRoot.appendChild(g);
  }

  // ---------- Bus building ----------
  function busPath(x0, x1, y, amp = 4) {
    const dx = x1 - x0;
    return [
      `M ${x0} ${y}`,
      `C ${snap(x0 + dx * 0.22)} ${snap(y - amp)}, ${snap(x0 + dx * 0.38)} ${snap(y + amp)}, ${snap(x0 + dx * 0.54)} ${y}`,
      `S ${snap(x0 + dx * 0.82)} ${snap(y - amp)}, ${x1} ${y}`
    ].join(" ");
  }

  function buildBus(parent, key, x0, x1, y, amp = 4) {
    const g = svgEl("g", {}, `pcb-bus pcb-bus--${key}`);
    g.dataset.pcbBus = key;

    const d = busPath(x0, x1, y, amp);

    g.appendChild(svgEl("path", { d }, "pcb-bus--base"));
    g.appendChild(svgEl("path", { d }, "pcb-bus--gold"));

    const sig = svgEl("path", { d }, "pcb-bus--signal is-pulse");
    sig.style.setProperty("--bus-speed", `${950 + Math.random() * 950}ms`);
    g.appendChild(sig);

    parent.appendChild(g);
    state.buses.set(key, { g, y, x0, x1 });
    return { g, y, x0, x1 };
  }

  function buildRail(parent, key, x, y0, y1) {
    const g = svgEl("g", {}, `pcb-bus pcb-bus--${key}`);
    g.dataset.pcbBus = key;

    const d = `M ${x} ${y0} L ${x} ${y1}`;

    g.appendChild(svgEl("path", { d }, "pcb-bus--base"));
    g.appendChild(svgEl("path", { d }, "pcb-bus--gold"));

    const sig = svgEl("path", { d }, "pcb-bus--signal is-pulse");
    sig.style.setProperty("--bus-speed", `${1200 + Math.random() * 900}ms`);
    g.appendChild(sig);

    parent.appendChild(g);
    state.buses.set(key, { g, y: null, x0: x, x1: x });
    return { g, x };
  }

  // ---------- Routing (rounded V→H corner) ----------
  function routeVH(start, end, r = 10) {
    const sx = start.x, sy = start.y;
    const ex = end.x, ey = end.y;

    const dy = ey - sy;
    const dx = ex - sx;

    if (Math.abs(dy) < r * 2 || Math.abs(dx) < r * 2) {
      return `M ${sx} ${sy} L ${sx} ${ey} L ${ex} ${ey}`;
    }

    const signY = dy >= 0 ? 1 : -1;
    const signX = dx >= 0 ? 1 : -1;

    const y1 = snap(ey - signY * r);
    const x2 = snap(sx + signX * r);

    return [
      `M ${sx} ${sy}`,
      `L ${sx} ${y1}`,
      `Q ${sx} ${ey} ${x2} ${ey}`,
      `L ${ex} ${ey}`
    ].join(" ");
  }

  // ---------- Sparks / via blink ----------
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
    if (!state.sparkLayer || prefersReducedMotion) return;

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

  function blinkViasRun(meta) {
    if (!meta || !meta.vias || prefersReducedMotion) return;

    meta.vias.forEach(v => v.classList.remove("is-blink"));
    meta.vias.forEach((via, i) => {
      window.setTimeout(() => {
        via.classList.add("is-blink");
        window.setTimeout(() => via.classList.remove("is-blink"), 1800);
      }, i * 110);
    });
  }

  // ---------- Net building ----------

  function buildNet(parent, id, d, end, opts = {}) {
    const g = svgEl("g", {}, "pcb-net");
    g.dataset.pcbId = id;

    if (opts.playful) g.classList.add("is-playful");
    g.style.setProperty("--trace-speed", opts.speed || `${760 + Math.random() * 680}ms`);
    if (opts.color) g.style.setProperty("--trace-color", opts.color);

    const base = svgEl("path", { d }, "pcb-trace--base");
    const hi   = svgEl("path", { d }, "pcb-trace--highlight");
    const sig  = svgEl("path", { d }, "pcb-trace--signal");

    g.appendChild(base);
    g.appendChild(hi);
    g.appendChild(sig);

    const vias = [];
    if (opts.vias) {
      for (const pt of opts.vias) {
        const via = svgEl("circle", { cx: pt.x, cy: pt.y, r: 3.05 }, "pcb-via");
        g.appendChild(via);
        vias.push(via);
      }
    }

    if (opts.endPad !== false) {
      const endPadR = opts.endPadR ?? 4.7;
      const endPadClass = opts.endPadClass ?? "pcb-pad";
      g.appendChild(svgEl("circle", { cx: end.x, cy: end.y, r: endPadR }, endPadClass));
    }

    parent.appendChild(g);

    // Allow decorative nets to skip registration if desired
    if (opts.register !== false) {
      state.nets.set(id, { g, end, vias, busKey: opts.busKey || null });
    }

    return g;
  }




  function displayedId() {
    return state.hoverId || state.activeId;
  }

  function applyActiveVisuals() {
    const id = displayedId();

    // IO chips
    for (const [key, el] of state.ioMap.entries()) {
      if (!el) continue;
      el.classList.toggle("is-active", key === id);
    }

    // Nets
    for (const [key, meta] of state.nets.entries()) {
      meta.g.classList.toggle("is-active", key === id);
    }

    // Buses: light up the one feeding the active net
    for (const [, bus] of state.buses.entries()) {
      bus.g && bus.g.classList && bus.g.classList.remove("is-hot");
    }
    if (id && state.nets.has(id)) {
      const busKey = state.nets.get(id).busKey;
      if (busKey && state.buses.has(busKey)) {
        state.buses.get(busKey).g.classList.add("is-hot");
      }
    }
  }

  function setHover(id) {
    state.hoverId = id;
    wakeFor(1400);
    applyActiveVisuals();

    const meta = state.nets.get(id);
    if (meta) {
      blinkViasRun(meta);
      spawnSparks(meta.end.x, meta.end.y, "star", 6);
    }
  }

  function clearHover() {
    state.hoverId = null;
    applyActiveVisuals();
  }

  // ---------- Build / layout ----------
  function rebuild() {
    state.rebuilding = true;
    const mastRect = masthead.getBoundingClientRect();
    const w = Math.max(1, Math.floor(mastRect.width));
    const h = Math.max(1, Math.floor(mastRect.height));

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    clearSvg(svg);
    state.nets.clear();
    state.buses.clear();
    state.ioMap = collectVisibleIO();

    addDefs(svg);
    buildSilkscreen(svg, w, h);

    // ---- Backbones (static, spaced, visible)
    const backbones = svgEl("g", {}, "pcb-backbones");
    svg.appendChild(backbones);

    const x0 = snap(w * 0.05);
    const x1 = snap(w * 0.95);

    // top + bottom buses near edges (keeps middle clean behind nav text)
    let yTop = snap(clamp(h * 0.20, 10, 18));
    let yBot = snap(clamp(h * 0.82, h - 18, h - 10));
    if (yBot - yTop < 26) {
      const mid = h * 0.5;
      yTop = snap(mid - 13);
      yBot = snap(mid + 13);
    }

    const busTop = buildBus(backbones, "top", x0, x1, yTop, 3.5);
    const busBot = buildBus(backbones, "bottom", x0, x1, yBot, 3.5);

    // left rail (power/ground vibe) — ensures left side is “wired”
    const cBox = cpuBox(cpu, mastRect, w, h);
    const railX = snap(clamp(cBox.x - 28, 10, cBox.x - 10));
    buildRail(backbones, "rail", railX, yTop, yBot);

    // ---- Traces group (actual interactive nets)
    const traces = svgEl("g", {}, "pcb-traces");
    svg.appendChild(traces);

    // CPU pins on all 4 sides (visible)
    const totalPins = clamp(state.ioMap.size + 6, 10, 18);
    const counts = {
      top: 3,
      bottom: 3,
      left: 3,
      right: Math.max(3, totalPins - 9)
    };
    const pins = cpuPinsPerimeter(cBox, w, h, counts);

    // pin pads
    const pinPads = svgEl("g", {}, "pcb-pins");
    traces.appendChild(pinPads);

    [...pins.top, ...pins.right, ...pins.bottom, ...pins.left].forEach((p) => {
      pinPads.appendChild(
        svgEl("circle", { cx: p.x, cy: p.y, r: CPU_PIN_R }, "pcb-pad pcb-pad--pin")
      );
    });


    // connect CPU pins into buses/rail (so top/bottom/left are genuinely connected)
    // - top pins → top bus
    pins.top.slice(0, 2).forEach((p, i) => {
      const end = { x: p.x, y: yTop };
      const d = routeVH(p, end, 9);
      buildNet(traces, `__cpu_top_${i}`, d, end, {
        busKey: "top",
        color: "var(--pcb-signal)",
        endPad: false,
        register: false
      });
    });

    // - bottom pins → bottom bus
    pins.bottom.slice(0, 2).forEach((p, i) => {
      const end = { x: p.x, y: yBot };
      const d = routeVH(p, end, 9);
      buildNet(traces, `__cpu_bot_${i}`, d, end, {
        busKey: "bottom",
        color: "var(--pcb-signal-2)",
        endPad: false,
        register: false
      });
    });

    // - left pins → rail
    pins.left.slice(0, 2).forEach((p, i) => {
      const end = { x: railX, y: p.y };
      // simple horizontal is fine here
      const d = `M ${p.x} ${p.y} L ${end.x} ${end.y}`;
      buildNet(traces, `__cpu_left_${i}`, d, end, {
        busKey: "rail",
        endPad: false,
        register: false
      });
    });

    // ---- IO targets
    const targets = [];
    for (const [id, el] of state.ioMap.entries()) {
      targets.push({
        id,
        el,
        end: pointForIO(el, mastRect, w, h)
      });
    }

    // Sort by X and alternate buses for guaranteed separation
    targets.sort((a, b) => a.end.x - b.end.x);

    const approach = 16; // last segment into pad (gives clean “pad entry”)
    targets.forEach((t, i) => {
      const busKey = (i % 2 === 0) ? "top" : "bottom";
      const bus = (busKey === "top") ? busTop : busBot;

      // tap point on the bus, slightly left of the end pad
      const tapX = snap(clamp(t.end.x - approach, x0 + 24, x1 - 24));
      const start = { x: tapX, y: bus.y };
      const end = t.end;

      // two vias: bus tap + corner
      const corner = { x: tapX, y: end.y };
      const vias = [start, corner];

      const d = routeVH(start, end, 10);

      const playful = (i % 3 === 0);
      const color = playful ? "var(--pcb-signal-2)" : "var(--pcb-signal)";

      buildNet(traces, t.id, d, end, {
        playful,
        color,
        vias,
        busKey
      });
    });

    buildSparksLayer(svg);

    state.activeId = pickActiveFromLocation(state.ioMap);
    applyActiveVisuals();

    // Let MutationObserver microtasks flush before allowing another rebuild trigger
    window.setTimeout(() => {
      state.rebuilding = false;
    }, 0);

  }

  function scheduleRebuild() {
    // Debounce bursts of resize/mutation events (prevents stutter + animation resets)
    if (state.rebuildTimer) window.clearTimeout(state.rebuildTimer);

    state.rebuildTimer = window.setTimeout(() => {
      state.rebuildTimer = 0;

      if (state.layoutRaf) return;
      state.layoutRaf = requestAnimationFrame(() => {
        state.layoutRaf = 0;
        rebuild();
      });
    }, 60);
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
    }, 2100);
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

  // ---------- Events ----------
  function wireEvents() {
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
      if (!io) return;

      const id = io.dataset.pcbId;
      const meta = state.nets.get(id);
      if (meta) spawnSparks(meta.end.x, meta.end.y, "heart", 7);
      wakeFor(1800);
    });
  }

  function wireObservers() {
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => scheduleRebuild());
      ro.observe(masthead);
    } else {
      window.addEventListener("resize", scheduleRebuild);
    }

    if ("MutationObserver" in window) {
      // Prefer watching the container that holds the IO links, not the whole masthead.
      const nav =
        masthead.querySelector("#site-nav") ||
        masthead.querySelector(".pcb-io[data-pcb-id]")?.closest("nav, ul, ol") ||
        null;

      // If we couldn't find a safe container, fall back to masthead,
      // BUT we will ignore SVG-originating mutations in the callback.
      const root = (nav && !nav.contains(svg)) ? nav : masthead;

      const mo = new MutationObserver((mutations) => {
        // Prevent rebuild() -> SVG mutations -> MO -> rebuild() loops
        if (state.rebuilding) return;

        // Ignore mutations caused by the SVG rebuild itself
        const meaningful = mutations.some((m) => !svg.contains(m.target));
        if (!meaningful) return;

        scheduleRebuild();
      });

      mo.observe(root, { childList: true, subtree: true });
    }


    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        state.inView = !!(entries[0] && entries[0].isIntersecting);
        if (!state.inView) {
          stopIdlePulses();
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

  window.addEventListener("load", () => scheduleRebuild());
  window.setTimeout(scheduleRebuild, 250);
})();
