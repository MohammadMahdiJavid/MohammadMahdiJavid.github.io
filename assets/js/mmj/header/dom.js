/* assets/js/mmj/header/dom.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  const CPU_PIN_R = 3.4;
  const CPU_PIN_OUT = 10;
  const CPU_PIN_INSET = 0.14;
  const CPU_PIN_MIN_PITCH = CPU_PIN_R * 2 + 0.35;

  function collectVisibleIO(root) {
    const all = Array.from(root.querySelectorAll(".pcb-io[data-pcb-id]"));
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
    const math = header.math;
    const r = ioEl.getBoundingClientRect();
    const isIcon = ioEl.classList.contains("pcb-io--icon");
    const pad = 14;

    const x = isIcon
      ? (r.right - mastRect.left) + pad
      : (r.left - mastRect.left) - pad;

    const y = (r.top - mastRect.top) + (r.height * 0.5);

    return {
      x: math.snap(math.clamp(x, 0, w)),
      y: math.snap(math.clamp(y, 0, h))
    };
  }

  function cpuBox(cpuEl, mastRect, w, h) {
    const math = header.math;
    if (!cpuEl) {
      return { x: math.snap(w * 0.10), y: math.snap(h * 0.25), w: math.snap(w * 0.18), h: math.snap(h * 0.50) };
    }

    const r = cpuEl.getBoundingClientRect();
    const x = math.snap(math.clamp(r.left - mastRect.left, 0, w));
    const y = math.snap(math.clamp(r.top - mastRect.top, 0, h));
    const ww = math.snap(math.clamp(r.width, 10, w));
    const hh = math.snap(math.clamp(r.height, 10, h));
    return { x, y, w: ww, h: hh };
  }

  function cpuPinsPerimeter(box, w, h, counts, opts = {}) {
    const math = header.math;
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

      const max = Math.max(1, Math.floor(L / minPitch) - 1);
      return Math.max(1, Math.min(requested, max));
    }

    function pinLine(count, a0, a1, fixed, horizontal) {
      if (count <= 0) return [];
      const pts = [];

      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        const v = header.math.lerp(a0, a1, t);
        pts.push(horizontal
          ? { x: math.snap(math.clamp(v, 0, w)), y: math.snap(math.clamp(fixed, 0, h)) }
          : { x: math.snap(math.clamp(fixed, 0, w)), y: math.snap(math.clamp(v, 0, h)) }
        );
      }

      return pts;
    }

    const topCount = fitCount(counts.top, safeX0, safeX1);
    const bottomCount = fitCount(counts.bottom, safeX0, safeX1);
    const leftCount = fitCount(counts.left, safeY0, safeY1);
    const rightCount = fitCount(counts.right, safeY0, safeY1);

    return {
      top: pinLine(topCount, safeX0, safeX1, box.y - out, true),
      right: pinLine(rightCount, safeY0, safeY1, box.x + box.w + out, false),
      bottom: pinLine(bottomCount, safeX0, safeX1, box.y + box.h + out, true),
      left: pinLine(leftCount, safeY0, safeY1, box.x - out, false)
    };
  }

  header.dom = {
    CPU_PIN_R,
    collectVisibleIO,
    pointForIO,
    cpuBox,
    cpuPinsPerimeter
  };
})(window);
