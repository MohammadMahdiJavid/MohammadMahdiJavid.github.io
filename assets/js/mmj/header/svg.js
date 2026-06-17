/* assets/js/mmj/header/svg.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(name, attrs = {}, className = "") {
    const el = document.createElementNS(SVG_NS, name);
    if (className) el.setAttribute("class", className);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  function clearSvg(node) {
    if (node && typeof node.replaceChildren === "function") {
      node.replaceChildren();
      return;
    }

    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function addDefs(svgRoot) {
    const defs = svgEl("defs");

    const copperGold = svgEl("linearGradient", {
      id: "pcbCopperGold", x1: "0%", y1: "0%", x2: "100%", y2: "0%"
    });
    copperGold.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#d68446", "stop-opacity": "0.95" }));
    copperGold.appendChild(svgEl("stop", { offset: "55%", "stop-color": "#ffd778", "stop-opacity": "0.92" }));
    copperGold.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#d68446", "stop-opacity": "0.80" }));

    const goldHot = svgEl("linearGradient", {
      id: "pcbGoldHot", x1: "0%", y1: "0%", x2: "100%", y2: "0%"
    });
    goldHot.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#ffd778", "stop-opacity": "0.00" }));
    goldHot.appendChild(svgEl("stop", { offset: "45%", "stop-color": "#fff0be", "stop-opacity": "0.95" }));
    goldHot.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#ffd778", "stop-opacity": "0.00" }));

    const padFill = svgEl("radialGradient", { id: "pcbPadFill", cx: "40%", cy: "35%", r: "70%" });
    padFill.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#fff0be", "stop-opacity": "0.92" }));
    padFill.appendChild(svgEl("stop", { offset: "70%", "stop-color": "#ffd778", "stop-opacity": "0.62" }));
    padFill.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#d68446", "stop-opacity": "0.35" }));

    defs.appendChild(copperGold);
    defs.appendChild(goldHot);
    defs.appendChild(padFill);
    svgRoot.appendChild(defs);
  }

  header.svg = {
    SVG_NS,
    svgEl,
    clearSvg,
    addDefs
  };
})(window);
