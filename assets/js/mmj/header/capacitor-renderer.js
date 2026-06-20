/* assets/js/mmj/header/capacitor-renderer.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  const CAPACITOR_VIEWBOX = "0 0 24 24";
  const CAPACITOR_ASPECT = 1;
  const CAPACITOR_LEAD_END_Y = 22.45 / 24;
  const BASE_LIGHTING_SPEED_MIN_MS = 1600;
  const BASE_LIGHTING_SPEED_RANGE_MS = 1300;
  const LIGHTING_FREQUENCY_MULTIPLIER = 3;

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
      header.capacitorArtSvg ||
      (header.capacitorArt && header.capacitorArt.svgContent) ||
      window.PCB_CAPACITOR_SVG_CONTENT ||
      ""
    );
  }

  function build(parent, comp) {
    const math = header.math;
    const className = [
      "pcb-component",
      "pcb-component--capacitor",
      comp.flipY ? "pcb-component--capacitor-top" : ""
    ].filter(Boolean).join(" ");

    const capacitor = header.svg.svgEl("svg", {
      x: math.snap(comp.x),
      y: math.snap(comp.y),
      width: math.snap(comp.ww),
      height: math.snap(comp.hh),
      viewBox: CAPACITOR_VIEWBOX,
      preserveAspectRatio: "xMidYMid meet",
      overflow: "visible",
      "aria-hidden": "true",
      focusable: "false"
    }, className);

    const ref = comp.ref || comp.label;
    if (ref) {
      capacitor.dataset.pcbRef = ref;
      capacitor.dataset.pcbComponent = ref;
    }

    const orientationAttrs = comp.flipY ? { transform: "translate(0 24) scale(1 -1)" } : {};
    const orientation = header.svg.svgEl("g", orientationAttrs, "pcb-c__orientation");
    const art = header.svg.svgEl("g", {}, "pcb-c__art");
    art.innerHTML = svgContent();
    orientation.appendChild(art);

    const fx = header.svg.svgEl("g", {}, "pcb-c__fx");
    const rimD = [
      "M 4.40 5.35",
      "C 4.40 3.00 7.80 2.15 12.00 2.15",
      "C 16.20 2.15 19.60 3.00 19.60 5.35",
      "C 19.60 7.70 16.20 8.55 12.00 8.55",
      "C 7.80 8.55 4.40 7.70 4.40 5.35",
      "Z"
    ].join(" ");

    const rimHalo = header.svg.svgEl("path", { d: rimD }, "pcb-c__rim--halo");
    const rimFlow = header.svg.svgEl("path", { d: rimD }, "pcb-c__rim--flow");
    const bodyGlow = header.svg.svgEl("path", {
      d: [
        "M 9.65 7.35",
        "C 10.35 7.62 11.12 7.78 12.00 7.78",
        "C 12.88 7.78 13.65 7.62 14.35 7.35",
        "L 14.35 17.05",
        "C 13.65 17.35 12.88 17.50 12.00 17.50",
        "C 11.12 17.50 10.35 17.35 9.65 17.05",
        "Z"
      ].join(" ")
    }, "pcb-c__body-glow");
    const sideGlowLeft = header.svg.svgEl("path", {
      d: "M 4.85 5.25 L 4.85 15.90"
    }, "pcb-c__side-glow");
    const sideGlowRight = header.svg.svgEl("path", {
      d: "M 19.15 5.25 L 19.15 15.90"
    }, "pcb-c__side-glow");
    const leadGlowLeft = header.svg.svgEl("path", {
      d: "M 8.65 22.45 L 8.65 18.55"
    }, "pcb-c__lead-glow");
    const leadGlowRight = header.svg.svgEl("path", {
      d: "M 15.35 22.45 L 15.35 18.55"
    }, "pcb-c__lead-glow");
    const polarityGlowLeft = header.svg.svgEl("path", {
      d: "M 6.25 9.70 L 6.25 11.75"
    }, "pcb-c__polarity-glow");
    const polarityGlowRight = header.svg.svgEl("path", {
      d: "M 17.75 13.55 L 17.75 15.25"
    }, "pcb-c__polarity-glow");
    const flow = header.svg.svgEl("path", {
      d: "M 8.65 22.45 L 8.65 10.20 C 9.60 10.85 10.70 11.18 12.00 11.18 C 13.30 11.18 14.40 10.85 15.35 10.20 L 15.35 22.45",
      fill: "none"
    }, "pcb-c__flow");

    fx.appendChild(bodyGlow);
    fx.appendChild(sideGlowLeft);
    fx.appendChild(sideGlowRight);
    fx.appendChild(leadGlowLeft);
    fx.appendChild(leadGlowRight);
    fx.appendChild(polarityGlowLeft);
    fx.appendChild(polarityGlowRight);
    fx.appendChild(rimHalo);
    fx.appendChild(rimFlow);
    fx.appendChild(flow);
    orientation.appendChild(fx);
    capacitor.appendChild(orientation);

    const baseSpeed = BASE_LIGHTING_SPEED_MIN_MS + Math.random() * BASE_LIGHTING_SPEED_RANGE_MS;
    const speed = baseSpeed / LIGHTING_FREQUENCY_MULTIPLIER;
    const phase = -Math.random() * speed;

    capacitor.style.setProperty("--cap-speed", `${speed}ms`);
    capacitor.style.setProperty("--cap-phase", `${phase}ms`);

    function syncLengths() {
      try {
        const len = flow.getTotalLength();
        flow.style.setProperty("--cap-travel-neg", (-len).toFixed(2));
        flow.style.setProperty("--cap-gap", (len + 26).toFixed(2));
      } catch {}

      try {
        const lenRim = rimFlow.getTotalLength();
        rimFlow.style.setProperty("--cap-rim-travel-neg", (-lenRim).toFixed(2));
        rimFlow.style.setProperty("--cap-rim-gap", (lenRim + 22).toFixed(2));
      } catch {}
    }

    syncLengths();
    parent.appendChild(capacitor);

    requestAnimationFrame(() => {
      if (capacitor.isConnected) syncLengths();
    });
  }

  header.capacitorRenderer = {
    CAPACITOR_ASPECT,
    CAPACITOR_LEAD_END_Y,
    computeComponentBox,
    build
  };
})(window);
