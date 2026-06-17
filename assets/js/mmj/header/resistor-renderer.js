/* assets/js/mmj/header/resistor-renderer.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  const RESISTOR_VIEWBOX = "16 112 480 288";
  const RESISTOR_ASPECT = 5 / 3;
  const RESISTOR_LEAD_END_Y = 272 / 288;

  function computeComponentBox(comp) {
    const math = header.math;
    const scale = comp.scale ?? 1;
    const ww = math.snap(comp.ww * scale);
    const hh = math.snap(comp.hh * scale);
    const x = math.snap(comp.x - (ww - comp.ww) / 2);
    const y = math.snap(comp.y - (hh - comp.hh) / 2);
    return { x, y, ww, hh };
  }

  function svgContent() {
    return (
      header.resistorArtSvg ||
      (header.resistorArt && header.resistorArt.svgContent) ||
      window.PCB_RESISTOR_SVG_CONTENT ||
      ""
    );
  }

  function build(parent, comp) {
    const math = header.math;
    const resistor = header.svg.svgEl("svg", {
      x: math.snap(comp.x),
      y: math.snap(comp.y),
      width: math.snap(comp.ww),
      height: math.snap(comp.hh),
      viewBox: RESISTOR_VIEWBOX,
      preserveAspectRatio: "xMidYMid meet",
      overflow: "visible",
      "aria-hidden": "true",
      focusable: "false"
    }, "pcb-component pcb-component--resistor");

    resistor.innerHTML = svgContent();

    const fx = header.svg.svgEl("g", {}, "pcb-r__fx");
    const edgeD0 = math.roundedRectPath(88, 126, 337, 152, 44);
    const edgeHalo = header.svg.svgEl("path", { d: edgeD0 }, "pcb-r__edge--halo");
    const edgeFlow = header.svg.svgEl("path", { d: edgeD0 }, "pcb-r__edge--flow");
    const flow = header.svg.svgEl("path", {
      d: "M 37 384 L 37 205 L 476 205 L 476 384",
      fill: "none"
    }, "pcb-r__flow");

    fx.appendChild(edgeHalo);
    fx.appendChild(edgeFlow);
    fx.appendChild(flow);
    resistor.appendChild(fx);

    const speed = 1400 + Math.random() * 1200;
    const phase = -Math.random() * speed;

    resistor.style.setProperty("--res-speed", `${speed}ms`);
    resistor.style.setProperty("--res-phase", `${phase}ms`);

    function syncLengths() {
      try {
        const len = flow.getTotalLength();
        flow.style.setProperty("--res-travel-neg", (-len).toFixed(2));
        flow.style.setProperty("--res-gap", (len + 240).toFixed(2));
      } catch {}

      try {
        const lenEdge = edgeFlow.getTotalLength();
        edgeFlow.style.setProperty("--res-edge-travel-neg", (-lenEdge).toFixed(2));
        edgeFlow.style.setProperty("--res-edge-gap", (lenEdge + 260).toFixed(2));
      } catch {}
    }

    syncLengths();
    parent.appendChild(resistor);

    requestAnimationFrame(() => {
      if (!resistor.isConnected) return;

      try {
        const bodyPaths = Array.from(resistor.querySelectorAll('path[fill="#FFC477"]'));
        if (bodyPaths.length) {
          let x0 = Infinity;
          let y0 = Infinity;
          let x1 = -Infinity;
          let y1 = -Infinity;

          for (const p of bodyPaths) {
            const b = p.getBBox();
            x0 = Math.min(x0, b.x);
            y0 = Math.min(y0, b.y);
            x1 = Math.max(x1, b.x + b.width);
            y1 = Math.max(y1, b.y + b.height);
          }

          const pad = 6;
          const x = x0 - pad;
          const y = y0 - pad;
          const w = (x1 - x0) + pad * 2;
          const h = (y1 - y0) + pad * 2;
          const r = Math.min(52, h * 0.34);
          const edgeD = math.roundedRectPath(x, y, w, h, r);
          edgeHalo.setAttribute("d", edgeD);
          edgeFlow.setAttribute("d", edgeD);

          const midY = y0 + (y1 - y0) * 0.5;
          const leadPaths = Array.from(resistor.querySelectorAll('path[fill="#E0E0E2"]'));
          let leftX = 37;
          let rightX = 476;
          let bottomY = 384;

          if (leadPaths.length) {
            let leftB = null;
            let rightB = null;

            for (const p of leadPaths) {
              const b = p.getBBox();
              bottomY = Math.max(bottomY, b.y + b.height);

              if (!leftB || b.x < leftB.x) leftB = b;
              if (!rightB || (b.x + b.width) > (rightB.x + rightB.width)) rightB = b;
            }

            if (leftB) leftX = leftB.x + leftB.width * 0.5;
            if (rightB) rightX = rightB.x + rightB.width * 0.5;
          }

          flow.setAttribute(
            "d",
            `M ${leftX} ${bottomY} L ${leftX} ${midY} L ${rightX} ${midY} L ${rightX} ${bottomY}`
          );
        }

        syncLengths();
      } catch {}
    });
  }

  header.resistorRenderer = {
    RESISTOR_ASPECT,
    RESISTOR_LEAD_END_Y,
    computeComponentBox,
    build
  };
})(window);
