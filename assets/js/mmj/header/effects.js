/* assets/js/mmj/header/effects.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  function wakeFor(root, state, ms = 1400) {
    root.classList.add("is-awake");
    window.clearTimeout(state.awakeTimer);
    state.awakeTimer = window.setTimeout(() => {
      root.classList.remove("is-awake");
    }, ms);
  }

  function buildSparksLayer(svgRoot, state) {
    const sparks = header.svg.svgEl("g", {}, "pcb-sparks");
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

  function spawnSparks(state, prefersReducedMotion, x, y, kind = "star", count = 6) {
    if (!state.sparkLayer || prefersReducedMotion) return;

    for (let i = 0; i < count; i++) {
      const holder = header.svg.svgEl("g", { transform: `translate(${x} ${y})` });

      const dx = (Math.random() * 42 - 21);
      const dy = -(8 + Math.random() * 30);
      const rot = (60 + Math.random() * 140) + "deg";
      const life = (700 + Math.random() * 520) + "ms";

      let shape;
      if (kind === "heart") {
        shape = header.svg.svgEl("path", { d: heartPath(5.2) }, "pcb-spark pcb-spark--heart");
        shape.style.setProperty("--spark-fill", "var(--pcb-spark-pink)");
      } else {
        shape = header.svg.svgEl("path", { d: "M 0 -4 L 4 0 L 0 4 L -4 0 Z" }, "pcb-spark");
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

  function blinkViasRun(meta, prefersReducedMotion) {
    if (!meta || !meta.vias || prefersReducedMotion) return;

    meta.vias.forEach(v => v.classList.remove("is-blink"));
    meta.vias.forEach((via, i) => {
      window.setTimeout(() => {
        via.classList.add("is-blink");
        window.setTimeout(() => via.classList.remove("is-blink"), 1800);
      }, i * 110);
    });
  }

  function startIdlePulses(state, prefersReducedMotion, displayedId, spawn) {
    stopIdlePulses(state);
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

      if (Math.random() < 0.25) spawn(meta.end.x, meta.end.y, "star", 5);
    }, 2100);
  }

  function stopIdlePulses(state) {
    if (state.idleInterval) window.clearInterval(state.idleInterval);
    state.idleInterval = 0;
  }

  header.effects = {
    wakeFor,
    buildSparksLayer,
    heartPath,
    spawnSparks,
    blinkViasRun,
    startIdlePulses,
    stopIdlePulses
  };
})(window);
