/* assets/js/mmj/header/pcb-trace-engine.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  function create(context) {
    const { root, svg, cpu, state } = context;
    const math = header.math;
    const svgApi = header.svg;
    const dom = header.dom;
    const activeNav = header.activeNav;
    const effects = header.effects;
    const resistorRenderer = header.resistorRenderer;
    const capacitorRenderer = header.capacitorRenderer;

    function busPath(x0, x1, y, amp = 4) {
      const dx = x1 - x0;
      return [
        `M ${x0} ${y}`,
        `C ${math.snap(x0 + dx * 0.22)} ${math.snap(y - amp)}, ${math.snap(x0 + dx * 0.38)} ${math.snap(y + amp)}, ${math.snap(x0 + dx * 0.54)} ${y}`,
        `S ${math.snap(x0 + dx * 0.82)} ${math.snap(y - amp)}, ${x1} ${y}`
      ].join(" ");
    }

    function buildBus(parent, key, x0, x1, y, amp = 4) {
      const g = svgApi.svgEl("g", {}, `pcb-bus pcb-bus--${key}`);
      g.dataset.pcbBus = key;

      const d = busPath(x0, x1, y, amp);

      g.appendChild(svgApi.svgEl("path", { d }, "pcb-bus--base"));
      g.appendChild(svgApi.svgEl("path", { d }, "pcb-bus--gold"));

      const sig = svgApi.svgEl("path", { d }, "pcb-bus--signal is-pulse");
      sig.style.setProperty("--bus-speed", `${950 + Math.random() * 950}ms`);
      g.appendChild(sig);

      parent.appendChild(g);
      state.buses.set(key, { g, y, x0, x1 });
      return { g, y, x0, x1 };
    }

    function buildRail(parent, key, x, y0, y1) {
      const g = svgApi.svgEl("g", {}, `pcb-bus pcb-bus--${key}`);
      g.dataset.pcbBus = key;

      const d = `M ${x} ${y0} L ${x} ${y1}`;

      g.appendChild(svgApi.svgEl("path", { d }, "pcb-bus--base"));
      g.appendChild(svgApi.svgEl("path", { d }, "pcb-bus--gold"));

      const sig = svgApi.svgEl("path", { d }, "pcb-bus--signal is-pulse");
      sig.style.setProperty("--bus-speed", `${1200 + Math.random() * 900}ms`);
      g.appendChild(sig);

      parent.appendChild(g);
      state.buses.set(key, { g, y: null, x0: x, x1: x });
      return { g, x };
    }

    function routeVH(start, end, r = 10) {
      const sx = start.x;
      const sy = start.y;
      const ex = end.x;
      const ey = end.y;
      const dy = ey - sy;
      const dx = ex - sx;

      if (Math.abs(dy) < r * 2 || Math.abs(dx) < r * 2) {
        return `M ${sx} ${sy} L ${sx} ${ey} L ${ex} ${ey}`;
      }

      const signY = dy >= 0 ? 1 : -1;
      const signX = dx >= 0 ? 1 : -1;
      const y1 = math.snap(ey - signY * r);
      const x2 = math.snap(sx + signX * r);

      return [
        `M ${sx} ${sy}`,
        `L ${sx} ${y1}`,
        `Q ${sx} ${ey} ${x2} ${ey}`,
        `L ${ex} ${ey}`
      ].join(" ");
    }

    function buildNet(parent, id, d, end, opts = {}) {
      const g = svgApi.svgEl("g", {}, "pcb-net");
      g.dataset.pcbId = id;

      if (opts.playful) g.classList.add("is-playful");
      g.style.setProperty("--trace-speed", opts.speed || `${760 + Math.random() * 680}ms`);
      if (opts.color) g.style.setProperty("--trace-color", opts.color);

      const base = svgApi.svgEl("path", { d }, "pcb-trace--base");
      const hi = svgApi.svgEl("path", { d }, "pcb-trace--highlight");
      const sig = svgApi.svgEl("path", { d }, "pcb-trace--signal");

      g.appendChild(base);
      g.appendChild(hi);
      g.appendChild(sig);

      const vias = [];
      if (opts.vias) {
        for (const pt of opts.vias) {
          const via = svgApi.svgEl("circle", { cx: pt.x, cy: pt.y, r: 3.05 }, "pcb-via");
          g.appendChild(via);
          vias.push(via);
        }
      }

      if (opts.endPad !== false) {
        const endPadR = opts.endPadR ?? 4.7;
        const endPadClass = opts.endPadClass ?? "pcb-pad";
        g.appendChild(svgApi.svgEl("circle", { cx: end.x, cy: end.y, r: endPadR }, endPadClass));
      }

      parent.appendChild(g);

      if (opts.register !== false) {
        state.nets.set(id, { g, end, vias, busKey: opts.busKey || null });
      }

      return g;
    }

    function buildSilkscreen(svgRoot, w, h, anchors = {}) {
      const yTop = anchors.yTop ?? math.snap(math.clamp(h * 0.20, 10, 18));
      const yBot = anchors.yBot ?? math.snap(math.clamp(h * 0.82, h - 18, h - 10));
      const resH = math.snap(math.clamp(h * 0.28, 20, 34));
      const resW = math.snap(resH * resistorRenderer.RESISTOR_ASPECT);
      const resX = math.snap(math.clamp(w * 0.34, 10, w - resW - 10));
      const resY = math.snap(math.clamp(yBot - (resH * resistorRenderer.RESISTOR_LEAD_END_Y), 8, h - resH - 8));
      const componentGap = math.snap(math.clamp(w * 0.018, 10, 18));
      const CAPACITOR_LEFT_NUDGE = 8;
      const CAPACITOR_MIN_R2_CLEARANCE = 5;

      function boxForDims(dims) {
        return {
          x: dims.x,
          y: dims.y,
          ww: dims.ww,
          hh: dims.hh,
          right: dims.x + dims.ww,
          bottom: dims.y + dims.hh
        };
      }

      function paddedBox(box, pad) {
        return {
          x: box.x - pad,
          y: box.y - pad,
          ww: box.ww + pad * 2,
          hh: box.hh + pad * 2,
          right: box.right + pad,
          bottom: box.bottom + pad
        };
      }

      function overlaps(a, b) {
        return !!(a && b) &&
          a.x < b.right &&
          a.right > b.x &&
          a.y < b.bottom &&
          a.bottom > b.y;
      }

      function elementBox(el, mastRect) {
        if (!el || !el.offsetParent) return null;

        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return null;

        const x = math.snap(math.clamp(r.left - mastRect.left, 0, w));
        const y = math.snap(math.clamp(r.top - mastRect.top, 0, h));
        const ww = math.snap(math.clamp(r.width, 0, w - x));
        const hh = math.snap(math.clamp(r.height, 0, h - y));
        return { x, y, ww, hh, right: x + ww, bottom: y + hh };
      }

      function labelBoxFor(dims, label, position) {
        const labelW = Math.max(12, label.length * 6.4);
        const labelH = 10;
        const labelX = math.snap(dims.x + dims.ww * 0.5);
        const labelY = position === "below"
          ? math.snap(dims.y + dims.hh + 11)
          : math.snap(dims.y - 8);

        return {
          x: labelX - labelW * 0.5,
          y: labelY - 8,
          ww: labelW,
          hh: labelH,
          right: labelX + labelW * 0.5,
          bottom: labelY + 2,
          baseline: labelY
        };
      }

      function isInsideMasthead(box) {
        return box.x >= 0 && box.y >= 0 && box.right <= w && box.bottom <= h;
      }

      function shouldRenderCapacitor(capDims, capLabelBox, fixedComps) {
        if (!isInsideMasthead(boxForDims(capDims)) || !isInsideMasthead(capLabelBox)) return false;

        const mastRect = root.getBoundingClientRect();
        const blockers = [];
        const blockedElements = new Set([
          cpu,
          root.querySelector(".site-title.pcb-cpu"),
          ...root.querySelectorAll(".greedy-nav .visible-links a"),
          ...root.querySelectorAll(".greedy-nav .search__toggle"),
          ...root.querySelectorAll(".greedy-nav .greedy-nav__toggle"),
          ...state.ioMap.values()
        ].filter(Boolean));

        for (const el of blockedElements) {
          const box = elementBox(el, mastRect);
          if (box) blockers.push(paddedBox(box, 5));
        }

        for (const comp of fixedComps) {
          if (comp.label === "R2" || comp.label === "U2" || comp.label === "LDO") {
            blockers.push(paddedBox(boxForDims(resistorRenderer.computeComponentBox(comp)), 5));
          }
        }

        const capBox = boxForDims(capDims);
        return !blockers.some((blocker) => overlaps(capBox, blocker) || overlaps(capLabelBox, blocker));
      }

      const fixedComps = [
        { x: w * 0.18, y: h * 0.78, ww: 36, hh: 14, label: "R1" },
        { x: resX, y: resY, ww: resW, hh: resH, label: "R2", type: "resistor" },
        { x: w * 0.56, y: h * 0.80, ww: 40, hh: 14, label: "U2" },
        { x: w * 0.74, y: h * 0.70, ww: 52, hh: 16, label: "LDO" }
      ];

      let capComp = null;
      const viewportWidth = window.innerWidth || w;
      const canShowAdjacentCapacitor = viewportWidth >= 560;
      if (capacitorRenderer && canShowAdjacentCapacitor) {
        const capH = math.snap(math.clamp(h * 0.24, 24, 31));
        const capW = math.snap(capH * capacitorRenderer.CAPACITOR_ASPECT);
        const capacitorGap = math.snap(Math.max(CAPACITOR_MIN_R2_CLEARANCE, componentGap - CAPACITOR_LEFT_NUDGE));
        const capX = math.snap(resX + resW + capacitorGap);
        const capY = math.snap(math.clamp(
          yTop - (capH * (1 - capacitorRenderer.CAPACITOR_LEAD_END_Y)),
          8,
          h - capH - 8
        ));
        const nextComponentX = w * 0.56;
        const hasRoomBesideResistor =
          capX + capW <= nextComponentX - componentGap &&
          capX + capW <= w - 10;

        const candidate = {
          x: capX,
          y: capY,
          ww: capW,
          hh: capH,
          label: "C1",
          type: "capacitor",
          flipY: true,
          labelPosition: "below"
        };
        const candidateDims = capacitorRenderer.computeComponentBox(candidate);
        const candidateLabelBox = labelBoxFor(candidateDims, candidate.label, candidate.labelPosition);

        if (hasRoomBesideResistor && shouldRenderCapacitor(candidateDims, candidateLabelBox, fixedComps)) {
          capComp = candidate;
        }
      }

      const g = svgApi.svgEl("g", {}, "pcb-decor");
      state.decorG = g;

      const comps = [
        fixedComps[0],
        fixedComps[1],
        capComp,
        fixedComps[2],
        fixedComps[3]
      ].filter(Boolean);

      for (const c of comps) {
        const renderer = c.type === "capacitor" ? capacitorRenderer : resistorRenderer;
        const dims = renderer.computeComponentBox(c);

        if (c.type === "resistor") {
          resistorRenderer.build(g, dims);
        } else if (c.type === "capacitor") {
          capacitorRenderer.build(g, { ...dims, label: c.label, flipY: c.flipY });
        } else {
          g.appendChild(svgApi.svgEl("rect", {
            x: dims.x,
            y: dims.y,
            width: dims.ww,
            height: dims.hh
          }, "pcb-component"));
        }

        const labelBox = labelBoxFor(dims, c.label, c.labelPosition);
        const t = svgApi.svgEl("text", {
          x: math.snap(dims.x + dims.ww * 0.5),
          y: labelBox.baseline
        }, "pcb-label");
        t.textContent = c.label;
        g.appendChild(t);
      }

      svgRoot.appendChild(g);
    }

    function rebuild() {
      state.rebuilding = true;

      try {
        const mastRect = root.getBoundingClientRect();
        const w = Math.max(1, Math.floor(mastRect.width));
        const h = Math.max(1, Math.floor(mastRect.height));

        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");

        svgApi.clearSvg(svg);
        state.nets.clear();
        state.buses.clear();
        state.ioMap = dom.collectVisibleIO(root);

        svgApi.addDefs(svg);

        const x0 = math.snap(w * 0.05);
        const x1 = math.snap(w * 0.95);

        let yTop = math.snap(math.clamp(h * 0.20, 10, 18));
        let yBot = math.snap(math.clamp(h * 0.82, h - 18, h - 10));
        if (yBot - yTop < 26) {
          const mid = h * 0.5;
          yTop = math.snap(mid - 13);
          yBot = math.snap(mid + 13);
        }

        buildSilkscreen(svg, w, h, { yTop, yBot });

        const backbones = svgApi.svgEl("g", {}, "pcb-backbones");
        svg.appendChild(backbones);

        const busTop = buildBus(backbones, "top", x0, x1, yTop, 3.5);
        const busBot = buildBus(backbones, "bottom", x0, x1, yBot, 3.5);

        const cBox = dom.cpuBox(cpu, mastRect, w, h);
        const railX = math.snap(math.clamp(cBox.x - 28, 10, cBox.x - 10));
        buildRail(backbones, "rail", railX, yTop, yBot);

        const traces = svgApi.svgEl("g", {}, "pcb-traces");
        svg.appendChild(traces);

        const totalPins = math.clamp(state.ioMap.size + 6, 10, 18);
        const counts = {
          top: 3,
          bottom: 3,
          left: 3,
          right: Math.max(3, totalPins - 9)
        };
        const pins = dom.cpuPinsPerimeter(cBox, w, h, counts);

        const pinPads = svgApi.svgEl("g", {}, "pcb-pins");
        traces.appendChild(pinPads);

        [...pins.top, ...pins.right, ...pins.bottom, ...pins.left].forEach((p) => {
          pinPads.appendChild(
            svgApi.svgEl("circle", { cx: p.x, cy: p.y, r: dom.CPU_PIN_R }, "pcb-pad pcb-pad--pin")
          );
        });

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

        pins.left.slice(0, 2).forEach((p, i) => {
          const end = { x: railX, y: p.y };
          const d = `M ${p.x} ${p.y} L ${end.x} ${end.y}`;
          buildNet(traces, `__cpu_left_${i}`, d, end, {
            busKey: "rail",
            endPad: false,
            register: false
          });
        });

        const targets = [];
        for (const [id, el] of state.ioMap.entries()) {
          targets.push({
            id,
            el,
            end: dom.pointForIO(el, mastRect, w, h)
          });
        }

        targets.sort((a, b) => a.end.x - b.end.x);

        const approach = 16;
        targets.forEach((t, i) => {
          const busKey = (i % 2 === 0) ? "top" : "bottom";
          const bus = (busKey === "top") ? busTop : busBot;
          const tapX = math.snap(math.clamp(t.end.x - approach, x0 + 24, x1 - 24));
          const start = { x: tapX, y: bus.y };
          const end = t.end;
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

        effects.buildSparksLayer(svg, state);

        state.activeId = activeNav.pickActiveFromLocation(state.ioMap);
        activeNav.applyActiveVisuals(state);

        window.setTimeout(() => {
          state.rebuilding = false;
        }, 0);
      } finally {
        window.setTimeout(() => {
          state.rebuilding = false;
        }, 0);
      }
    }

    function scheduleRebuild() {
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

    return {
      rebuild,
      scheduleRebuild,
      routeVH,
      buildNet
    };
  }

  header.traceEngine = { create };
})(window);
