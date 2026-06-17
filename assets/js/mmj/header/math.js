/* assets/js/mmj/header/math.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function snap(n) {
    return Math.round(n * 2) / 2;
  }

  function roundedRectPath(x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    const x0 = x;
    const x1 = x + w;
    const y0 = y;
    const y1 = y + h;

    return [
      `M ${x0 + rr} ${y0}`,
      `H ${x1 - rr}`,
      `Q ${x1} ${y0} ${x1} ${y0 + rr}`,
      `V ${y1 - rr}`,
      `Q ${x1} ${y1} ${x1 - rr} ${y1}`,
      `H ${x0 + rr}`,
      `Q ${x0} ${y1} ${x0} ${y1 - rr}`,
      `V ${y0 + rr}`,
      `Q ${x0} ${y0} ${x0 + rr} ${y0}`,
      "Z"
    ].join(" ");
  }

  header.math = {
    clamp,
    lerp,
    snap,
    roundedRectPath
  };
})(window);
