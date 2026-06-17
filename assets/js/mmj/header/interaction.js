/* assets/js/mmj/header/interaction.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};
  const IO_SELECTOR = ".pcb-io[data-pcb-id]";

  function closestIO(target) {
    return target && target.closest ? target.closest(IO_SELECTOR) : null;
  }

  function wire(root, handlers) {
    const { setHover, clearHover, pointerDown } = handlers;

    root.addEventListener("pointerover", (ev) => {
      const io = closestIO(ev.target);
      if (!io) return;
      setHover(io.dataset.pcbId);
    });

    root.addEventListener("pointerout", (ev) => {
      const io = closestIO(ev.target);
      if (!io) return;

      const to = closestIO(ev.relatedTarget);
      if (to) return;

      clearHover();
    });

    root.addEventListener("focusin", (ev) => {
      const io = closestIO(ev.target);
      if (!io) return;
      setHover(io.dataset.pcbId);
    });

    root.addEventListener("focusout", (ev) => {
      const io = closestIO(ev.target);
      if (!io) return;
      clearHover();
    });

    root.addEventListener("pointerdown", (ev) => {
      const io = closestIO(ev.target);
      if (!io) return;
      pointerDown(io.dataset.pcbId);
    });
  }

  header.interaction = { wire };
})(window);
