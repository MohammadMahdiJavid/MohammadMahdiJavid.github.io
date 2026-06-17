/* assets/js/mmj/header/observers.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  function wire(context, callbacks) {
    const { root, svg, state } = context;
    const { scheduleRebuild, startIdlePulses, stopIdlePulses } = callbacks;

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => scheduleRebuild());
      ro.observe(root);
    } else {
      window.addEventListener("resize", scheduleRebuild);
    }

    if ("MutationObserver" in window) {
      const nav =
        root.querySelector("#site-nav") ||
        root.querySelector(".greedy-nav") ||
        (root.querySelector(".pcb-io[data-pcb-id]") &&
          root.querySelector(".pcb-io[data-pcb-id]").closest("nav, ul, ol")) ||
        null;

      const observedRoot = (nav && !nav.contains(svg)) ? nav : root;
      const mo = new MutationObserver((mutations) => {
        if (state.rebuilding) return;

        const meaningful = mutations.some((m) => !svg.contains(m.target));
        if (!meaningful) return;

        scheduleRebuild();
      });

      mo.observe(observedRoot, { childList: true, subtree: true });
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

      io.observe(root);
    }
  }

  header.observers = { wire };
})(window);
