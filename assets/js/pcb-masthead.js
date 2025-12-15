

// assets/js/pcb-masthead.js


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
    ioMap: new Map(),      // id -> element
    nets: new Map(),       // id -> { g, end:{x,y}, vias:[] }
    hoverId: null,
    activeId: null,
    inView: true,
    layoutRaf: 0,
    idleInterval: 0,
    awakeTimer: 0,
    blinkTimer: 0,
    bootTimer: 0,
    sparkLayer: null,
    busSignalPath: null,
    parallaxRaf: 0,
    lastPointer: null
  };

  // ---------- Helpers ----------
  function svgEl(name, attrs = {}, className = "") {
    const el = document.createElementNS(SVG_NS, name);
    if (className) el.setAttribute("class", className);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  function clearSvg(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function wakeFor(ms = 1600) {
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

  // Visible IO elements (avoid duplicates from greedy-nav hidden links)
  function collectVisibleIO() {
    const all = Array.from(masthead.querySelectorAll(".pcb-io[data-pcb-id]"));
    const byId = new Map();

    for (const el of all) {
      const id = el.dataset.pcbId;
      if (!id) continue;

      // Prefer the visible instance (greedy-nav may clone/move links)
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

  function pointForCPU(cpuEl, mastRect) {
    if (!cpuEl) return { x: 30, y: mastRect.height * 0.5 };
    const r = cpuEl.getBoundingClientRect();
    const x = (r.right - mastRect.left) + 10;
    const y = (r.top - mastRect.top) + (r.height * 0.5);
    return { x: clamp(x, 0, mastRect.width), y: clamp(y, 0, mastRect.height) };
  }

  // Connect traces to the LED dot side:
  // - normal links: LED dot is on the LEFT (pseudo ::after left:-0.55rem)
  // - icon button: LED dot is on the RIGHT (pseudo ::after right:-0.55rem)
  function pointForIO(ioEl, mastRect) {
    const r = ioEl.getBoundingClientRect();
    const isIcon = ioEl.classList.contains("pcb-io--icon");
    const x = isIcon
      ? (r.right - mastRect.left) + 10
      : (r.left - mastRect.left) - 10;
    const y = (r.top - mastRect.top) + (r.height * 0.5);
    return { x: clamp(x, 0, mastRect.width), y: clamp(y, 0, mastRect.height) };
  }

  // "PCB-ish" route: short straight, soft bend, vertical align, straight into target
  function routeTrace(start, end, w, h, seed = 0) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // If something is weird (tiny screens / reversed), fall back to a simple bezier
    if (dx < 40) {
      const c1x = start.x + 25;
      const c2x = end.x - 25;
      return `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`;
    }

    const x1 = start.x + clamp(dx * 0.22, 34, 120);
    const x2 = end.x - clamp(dx * 0.16, 26, 120);

    // Bend line around the middle with a tiny whimsical offset
    const whimsy = (Math.sin(seed * 2.13) * 0.5 + 0.5) * (h * 0.06);
    const yBend = clamp(start.y + (dy * 0.55) + (dy < 0 ? -whimsy : whimsy), 12, h - 12);

    return [
      `M ${start.x} ${start.y}`,
      `L ${x1} ${start.y}`,
      `C ${x1 + 18} ${start.y}, ${x2 - 18} ${yBend}, ${x2} ${yBend}`,
      `L ${x2} ${end.y}`,
      `L ${end.x} ${end.y}`
    ].join(" ");
  }

  function addDefs(svgRoot) {
    const defs = svgEl("defs");

    // Copper->Gold gradient
    const copperGold = svgEl("linearGradient", {
      id: "pcbCopperGold",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "0%"
    });
    copperGold.appendChild(svgEl("stop", { offset: "0%", "stop-color": "rgba(214,132,70,0.95)" }));
    copperGold.appendChild(svgEl("stop", { offset: "55%", "stop-color": "rgba(255,215,120,0.92)" }));
    copperGold.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(214,132,70,0.80)" }));

    // Hot gold highlight
    const goldHot = svgEl("linearGradient", {
      id: "pcbGoldHot",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "0%"
    });
    goldHot.appendChild(svgEl("stop", { offset: "0%", "stop-color": "rgba(255,215,120,0.00)" }));
    goldHot.appendChild(svgEl("stop", { offset: "45%", "stop-color": "rgba(255,240,190,0.95)" }));
    goldHot.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(255,215,120,0.00)" }));

    // Pad fill radial
    const padFill = svgEl("radialGradient", {
      id: "pcbPadFill",
      cx: "40%",
      cy: "35%",
      r: "70%"
    });
    padFill.appendChild(svgEl("stop", { offset: "0%", "stop-color": "rgba(255,240,190,0.92)" }));
    padFill.appendChild(svgEl("stop", { offset: "70%", "stop-color": "rgba(255,215,120,0.62)" }));
    padFill.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(214,132,70,0.35)" }));

    defs.appendChild(copperGold);
    defs.appendChild(goldHot);
    defs.appendChild(padFill);
    svgRoot.appendChild(defs);
  }

  function buildDecor(svgRoot, w, h) {
    const decor = svgEl("g", {}, "pcb-decor");

    // Bus lines near bottom
    const busY = h * 0.86;
    const bus = svgEl("g", {}, "pcb-bus");

    const dBus = `M ${w * 0.06} ${busY}
                  C ${w * 0.22} ${busY - 8}, ${w * 0.38} ${busY + 10}, ${w * 0.54} ${busY}
                  S ${w * 0.82} ${busY - 8}, ${w * 0.94} ${busY}`;

    bus.appendChild(svgEl("path", { d: dBus }, "pcb-bus pcb-bus--base"));
    bus.appendChild(svgEl("path", { d: dBus }, "pcb-bus pcb-bus--gold"));

    const busSignal = svgEl("path", { d: dBus }, "pcb-bus pcb-bus--signal is-pulse");
    busSignal.style.setProperty("--bus-speed", `${900 + Math.random() * 900}ms`);
    state.busSignalPath = busSignal;
    bus.appendChild(busSignal);

    decor.appendChild(bus);

    // A few cute "components" (silkscreen vibe)
    const comps = [
      { x: w * 0.18, y: h * 0.70, ww: 36, hh: 14, label: "R1" },
      { x: w * 0.32, y: h * 0.62, ww: 44, hh: 16, label: "C3" },
      { x: w * 0.52, y: h * 0.72, ww: 40, hh: 14, label: "U2" },
      { x: w * 0.70, y: h * 0.62, ww: 52, hh: 16, label: "LDO" }
    ];

    for (const c of comps) {
      decor.appendChild(
        svgEl("rect", { x: c.x, y: c.y, width: c.ww, height: c.hh }, "pcb-component")
      );
      decor.appendChild(
        svgEl("text", { x: c.x + c.ww * 0.5, y: c.y - 8 }, "pcb-label")
      ).textContent = c.label;
    }

    // Dashed "silkscreen line"
    decor.appendChild(
      svgEl("path", {
        d: `M ${w * 0.12} ${h * 0.56} L ${w * 0.88} ${h * 0.56}`
      }, "pcb-component-line")
    );

    svgRoot.appendChild(decor);
  }

  function makeHeartPath(size = 10) {
    // Small heart centered around (0,0)
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

  function addViasForPath(netG, refPath, count = 3) {
    const vias = [];
    try {
      const len = refPath.getTotalLength();
      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        const pt = refPath.getPointAtLength(len * t);
        const via = svgEl("circle", { cx: pt.x, cy: pt.y, r: 3.1 }, "pcb-via");
        netG.appendChild(via);
        vias.push(via);
      }
    } catch {
      // ignore if measurement fails
    }
    return vias;
  }

  function buildNet(svgRoot, id, start, end, opts = {}) {
    const g = svgEl("g", {}, "pcb-net");
    g.dataset.pcbId = id;

    if (opts.heartbeat) g.classList.add("is-heartbeat");
    if (opts.playful) g.classList.add("is-playful");

    g.style.setProperty("--trace-speed", opts.speed || `${760 + Math.random() * 700}ms`);
    if (opts.color) g.style.setProperty("--trace-color", opts.color);

    const d = routeTrace(start, end, opts.w, opts.h, opts.seed || 0);

    const base = svgEl("path", { d }, "pcb-trace--base");
    const hi = svgEl("path", { d }, "pcb-trace--highlight");
    const sig = svgEl("path", { d }, "pcb-trace--signal");

    g.appendChild(base);
    g.appendChild(hi);
    g.appendChild(sig);

    svgRoot.appendChild(g);

    const vias = addViasForPath(g, sig, opts.vias || 3);

    state.nets.set(id, { g, end, vias });
    return g;
  }

  function buildSparksLayer(svgRoot) {
    const sparks = svgEl("g", {}, "pcb-sparks");
    svgRoot.appendChild(sparks);
    state.sparkLayer = sparks;
  }

  function spawnSparks(x, y, kind = "star", count = 6) {
    if (!state.sparkLayer) return;
    if (prefersReducedMotion) return;

    const layer = state.sparkLayer;

    for (let i = 0; i < count; i++) {
      const holder = svgEl("g", { transform: `translate(${x} ${y})` });

      const dx = (Math.random() * 40 - 20);
      const dy = -(8 + Math.random() * 26);
      const rot = (60 + Math.random() * 140) + "deg";
      const life = (700 + Math.random() * 520) + "ms";

      let shape;
      if (kind === "heart") {
        shape = svgEl("path", { d: makeHeartPath(5.2) }, "pcb-spark pcb-spark--heart");
        shape.style.setProperty("--spark-fill", "var(--pcb-spark-pink)");
      } else {
        // tiny diamond
        shape = svgEl("path", { d: "M 0 -4 L 4 0 L 0 4 L -4 0 Z" }, "pcb-spark");
      }

      shape.style.setProperty("--dx", `${dx}px`);
      shape.style.setProperty("--dy", `${dy}px`);
      shape.style.setProperty("--rot", rot);
      shape.style.setProperty("--spark-life", life);

      holder.appendChild(shape);
      layer.appendChild(holder);

      // Kick the animation
      requestAnimationFrame(() => shape.classList.add("is-pop"));

      // Cleanup
      window.setTimeout(() => holder.remove(), 1400);
    }
  }

  function blinkViasRun(net) {
    if (!net || !net.vias || prefersReducedMotion) return;
    const vias = net.vias;
    vias.forEach((v) => v.classList.remove("is-blink"));

    vias.forEach((via, i) => {
      window.setTimeout(() => {
        via.classList.add("is-blink");
        window.setTimeout(() => via.classList.remove("is-blink"), 1900);
      }, i * 120);
    });
  }

  function displayedId() {
    return state.hoverId || state.activeId;
  }

  function applyActiveVisuals() {
    const id = displayedId();

    // IO classes
    for (const [key, el] of state.ioMap.entries()) {
      if (!el) continue;
      el.classList.toggle("is-active", key === id);
    }

    // Net classes
    for (const [key, meta] of state.nets.entries()) {
      meta.g.classList.toggle("is-active", key === id);
    }
  }

  function setHover(id) {
    state.hoverId = id;
    wakeFor(1400);
    applyActiveVisuals();

    const net = state.nets.get(id);
    if (net) blinkViasRun(net);

    // Spark at end of the net
    if (net) spawnSparks(net.end.x, net.end.y, "star", 6);
  }

  function clearHover() {
    state.hoverId = null;
    applyActiveVisuals();
  }

  // ---------- Layout / Rebuild ----------
  function rebuild() {
    const mastRect = masthead.getBoundingClientRect();
    const w = Math.max(1, Math.floor(mastRect.width));
    const h = Math.max(1, Math.floor(mastRect.height));

    // SVG sizing
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    clearSvg(svg);
    state.nets.clear();
    state.ioMap = collectVisibleIO();

    addDefs(svg);
    buildDecor(svg, w, h);

    // Sparks layer must be on top of traces
    // We'll build traces first, then sparks on top.
    const tracesGroup = svgEl("g");
    svg.appendChild(tracesGroup);

    const start = pointForCPU(cpu, mastRect);

    // Cute heartbeat net + heart pad
    const heartX = w * 0.44;
    const heartY = h * 0.74;

    const heartPad = svgEl("path", { d: makeHeartPath(9.2) }, "pcb-pad pcb-pad--heart");
    heartPad.setAttribute("transform", `translate(${heartX} ${heartY})`);
    tracesGroup.appendChild(heartPad);

    buildNet(tracesGroup, "__heart", start, { x: heartX, y: heartY }, {
      w, h,
      heartbeat: true,
      vias: 2,
      speed: "1100ms",
      color: "var(--pcb-spark-pink)",
      seed: 0.33
    });

    // Build nets for visible IO elements (excluding duplicates)
    const ids = Array.from(state.ioMap.keys());
    ids.forEach((id, idx) => {
      const el = state.ioMap.get(id);
      if (!el) return;

      const end = pointForIO(el, mastRect);

      const playful = (idx % 3 === 0);
      const color = playful ? "var(--pcb-signal-2)" : "var(--pcb-signal)";

      buildNet(tracesGroup, id, start, end, {
        w, h,
        playful,
        color,
        vias: 3,
        seed: 0.7 + idx * 0.17
      });

      // Optional: add a small pad near the target (subtle “test pad” look)
      const pad = svgEl("circle", { cx: end.x, cy: end.y, r: 4.6 }, "pcb-pad");
      tracesGroup.appendChild(pad);
    });

    buildSparksLayer(svg);

    // Determine "active page" link
    const picked = pickActiveFromLocation(state.ioMap);
    state.activeId = picked;

    applyActiveVisuals();

    // Kick a cute boot sequence (only if not reduced motion)
    if (!prefersReducedMotion) runBootSequence();
  }

  function scheduleRebuild() {
    if (state.layoutRaf) return;
    state.layoutRaf = requestAnimationFrame(() => {
      state.layoutRaf = 0;
      rebuild();
    });
  }

  // ---------- Boot + Idle ----------
  function runBootSequence() {
    window.clearTimeout(state.bootTimer);

    const ids = Array.from(state.ioMap.keys());
    if (!ids.length) return;

    // Step through a few nets quickly like "power-on self test"
    let i = 0;
    const steps = Math.min(ids.length, 6);
    const sequence = ids.slice(0, steps);

    const step = () => {
      if (!state.inView) {
        state.bootTimer = window.setTimeout(step, 600);
        return;
      }

      const id = sequence[i % sequence.length];
      setHover(id);

      const net = state.nets.get(id);
      if (net) spawnSparks(net.end.x, net.end.y, (i % 2 === 0 ? "star" : "heart"), 6);

      i += 1;

      if (i < sequence.length) {
        state.bootTimer = window.setTimeout(step, 220);
      } else {
        // return to normal (keep active page if any)
        state.bootTimer = window.setTimeout(() => {
          clearHover();
          applyActiveVisuals();
        }, 700);
      }
    };

    step();
  }

  function startIdlePulses() {
    stopIdlePulses();

    if (prefersReducedMotion) return;

    state.idleInterval = window.setInterval(() => {
      if (!state.inView) return;

      const keys = Array.from(state.nets.keys()).filter(k => k !== "__heart");
      if (!keys.length) return;

      // Random net idling (not the currently active/hovered)
      const avoid = displayedId();
      let pick = keys[Math.floor(Math.random() * keys.length)];
      if (pick === avoid && keys.length > 1) {
        pick = keys[(keys.indexOf(pick) + 1) % keys.length];
      }

      const meta = state.nets.get(pick);
      if (!meta) return;

      meta.g.classList.add("is-idle");
      window.setTimeout(() => meta.g.classList.remove("is-idle"), 1400);

      // Occasionally sparkle the heartbeat pad
      if (Math.random() < 0.24) {
        const heart = state.nets.get("__heart");
        if (heart) spawnSparks(heart.end.x, heart.end.y, "heart", 5);
      }
    }, 1900);
  }

  function stopIdlePulses() {
    if (state.idleInterval) window.clearInterval(state.idleInterval);
    state.idleInterval = 0;
  }

  // ---------- Cute CPU face blink ----------
  function startRandomBlink() {
    stopRandomBlink();
    if (!cpuFace) return;
    if (prefersReducedMotion) return;

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

  // ---------- Parallax ----------
  function applyParallaxFromPointer() {
    state.parallaxRaf = 0;
    if (!state.lastPointer) return;

    const { x, y } = state.lastPointer;
    const r = masthead.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const nx = clamp((x - cx) / (r.width / 2), -1, 1);
    const ny = clamp((y - cy) / (r.height / 2), -1, 1);

    // Small drift so it feels fancy, not nauseating
    const px = nx * 6;
    const py = ny * 4;

    masthead.style.setProperty("--pcb-par-x", px.toFixed(2));
    masthead.style.setProperty("--pcb-par-y", py.toFixed(2));
  }

  function onPointerMove(ev) {
    if (prefersReducedMotion) return;
    if (!state.inView) return;
    state.lastPointer = { x: ev.clientX, y: ev.clientY };

    if (!state.parallaxRaf) {
      state.parallaxRaf = requestAnimationFrame(applyParallaxFromPointer);
    }
  }

  function resetParallax() {
    masthead.style.setProperty("--pcb-par-x", "0");
    masthead.style.setProperty("--pcb-par-y", "0");
  }

  // ---------- Event wiring (delegation) ----------
  function wireEvents() {
    // Hover/focus on IO
    masthead.addEventListener("pointerover", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;

      const id = io.dataset.pcbId;
      if (!id) return;

      setHover(id);
    });

    masthead.addEventListener("pointerout", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;

      // If moving into another .pcb-io, don't clear
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

    // Press sparks (doesn't block navigation)
    masthead.addEventListener("pointerdown", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (io) {
        const id = io.dataset.pcbId;
        const net = state.nets.get(id);
        if (net) spawnSparks(net.end.x, net.end.y, "heart", 7);
        wakeFor(1800);
        return;
      }

      // CPU boop + heart burst
      const isCpu = cpu && (ev.target === cpu || (ev.target.closest && ev.target.closest("#pcb-cpu")));
      if (isCpu) {
        wakeFor(2000);
        cpu.classList.add("is-boop");
        window.setTimeout(() => cpu.classList.remove("is-boop"), 560);

        const mastRect = masthead.getBoundingClientRect();
        const start = pointForCPU(cpu, mastRect);
        spawnSparks(start.x + 10, start.y, "heart", 9);
      }
    });

    // CPU hover wakes the board vibe
    if (cpu) {
      cpu.addEventListener("pointerenter", () => masthead.classList.add("is-cpu-hover"));
      cpu.addEventListener("pointerleave", () => masthead.classList.remove("is-cpu-hover"));
    }

    // Parallax
    masthead.addEventListener("pointermove", onPointerMove);
    masthead.addEventListener("pointerleave", () => {
      state.lastPointer = null;
      resetParallax();
    });
  }

  // ---------- Observers ----------
  function wireObservers() {
    // Resize: rebuild traces so they keep “attached” to nav items
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => scheduleRebuild());
      ro.observe(masthead);
    } else {
      window.addEventListener("resize", scheduleRebuild);
    }

    // Greedy-nav moves items between visible/hidden: observe changes
    if ("MutationObserver" in window) {
      const nav = masthead.querySelector("#site-nav") || masthead;
      const mo = new MutationObserver(() => scheduleRebuild());
      mo.observe(nav, { childList: true, subtree: true });
    }

    // Stop idle animations when offscreen
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        state.inView = !!(entries[0] && entries[0].isIntersecting);
        if (!state.inView) {
          stopIdlePulses();
          resetParallax();
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
})();


