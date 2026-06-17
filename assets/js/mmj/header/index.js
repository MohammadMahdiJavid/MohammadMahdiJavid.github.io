/* assets/js/mmj/header/index.js */

(function (window, document) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  function createState() {
    return {
      ioMap: new Map(),
      nets: new Map(),
      buses: new Map(),

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
      blinkTimer: 0
    };
  }

  function init(root) {
    root = root || document.querySelector("[data-pcb-masthead]");
    if (!root) return null;

    const svg = root.querySelector(".pcb-masthead__traces");
    if (!svg) return null;

    if (root.dataset.pcbMastheadInit === "1") return null;
    root.dataset.pcbMastheadInit = "1";

    const cpu = root.querySelector("#pcb-cpu");
    const cpuFace = root.querySelector(".pcb-cpu__face");
    const prefersReducedMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = createState();

    function displayedId() {
      return header.activeNav.displayedId(state);
    }

    function applyActiveVisuals() {
      header.activeNav.applyActiveVisuals(state);
    }

    function spawn(x, y, kind, count) {
      header.effects.spawnSparks(state, prefersReducedMotion, x, y, kind, count);
    }

    function wake(ms) {
      header.effects.wakeFor(root, state, ms);
    }

    function setHover(id) {
      state.hoverId = id;
      wake(1400);
      applyActiveVisuals();

      const meta = state.nets.get(id);
      if (meta) {
        header.effects.blinkViasRun(meta, prefersReducedMotion);
        spawn(meta.end.x, meta.end.y, "star", 6);
      }
    }

    function clearHover() {
      state.hoverId = null;
      applyActiveVisuals();
    }

    function startIdlePulses() {
      header.effects.startIdlePulses(state, prefersReducedMotion, displayedId, spawn);
    }

    function stopIdlePulses() {
      header.effects.stopIdlePulses(state);
    }

    const engine = header.traceEngine.create({ root, svg, cpu, state, prefersReducedMotion });

    engine.rebuild();
    header.interaction.wire(root, {
      setHover,
      clearHover,
      pointerDown(id) {
        const meta = state.nets.get(id);
        if (meta) spawn(meta.end.x, meta.end.y, "heart", 7);
        wake(1800);
      }
    });
    header.observers.wire({ root, svg, state }, {
      scheduleRebuild: engine.scheduleRebuild,
      startIdlePulses,
      stopIdlePulses
    });
    startIdlePulses();
    header.robotBlink.startRandomBlink(state, cpuFace, prefersReducedMotion);

    window.addEventListener("load", engine.scheduleRebuild);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(engine.scheduleRebuild);
    } else {
      window.setTimeout(engine.scheduleRebuild, 250);
    }

    return {
      root,
      svg,
      state,
      rebuild: engine.rebuild,
      scheduleRebuild: engine.scheduleRebuild
    };
  }

  function initAll() {
    return Array.from(document.querySelectorAll("[data-pcb-masthead]"), init);
  }

  header.init = init;
  header.initAll = initAll;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})(window, document);
