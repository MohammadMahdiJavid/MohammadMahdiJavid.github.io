/* assets/js/pcb-masthead.js */

(() => {
  "use strict";

  const masthead = document.querySelector("[data-pcb-masthead]");
  if (!masthead) return;

  const svg = masthead.querySelector(".pcb-masthead__traces");
  if (!svg) return;

  if (masthead.dataset.pcbMastheadInit === "1") return;
  masthead.dataset.pcbMastheadInit = "1";

  const cpu = masthead.querySelector("#pcb-cpu");
  const cpuFace = masthead.querySelector(".pcb-cpu__face");

  const SVG_NS = "http://www.w3.org/2000/svg";
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    ioMap: new Map(),
    nets: new Map(),   // id -> { g, end:{x,y}, vias:[], busKey }
    buses: new Map(),  // key -> { g, y, x0, x1 }

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
    blinkTimer: 0,
  };

  // ---------- Small math helpers ----------
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const snap = (n) => Math.round(n * 2) / 2; // 0.5px snapping helps crisp strokes

  // CPU pin tuning (prevents overlap + looks more like real pins)
  const CPU_PIN_R = 3.4;          // smaller than before (3.75)
  const CPU_PIN_OUT = 10;         // distance outside CPU box
  const CPU_PIN_INSET = 0.14;     // usable band along edges (wider than before)
  const CPU_PIN_MIN_PITCH = CPU_PIN_R * 2 + 0.35; // must be > diameter to avoid overlap

  const RESISTOR_SVG_CONTENT = `
<path fill="var(--pcb-bg-1, #0a3b2d)" opacity="1.000000" stroke="none" 
	d="
M326.000000,513.000000 
	C217.359726,513.000000 109.219444,513.000000 1.039583,513.000000 
	C1.039583,342.401367 1.039583,171.802719 1.039583,1.102037 
	C171.556946,1.102037 342.113983,1.102037 512.835510,1.102037 
	C512.835510,171.666534 512.835510,342.333252 512.835510,513.000000 
	C450.802704,513.000000 388.651337,513.000000 326.000000,513.000000 
M136.999298,153.500000 
	C136.999298,193.294113 136.999298,233.088226 136.999298,272.882355 
	C137.638626,273.028564 138.277939,273.174774 138.917267,273.320984 
	C140.241516,269.589233 141.696152,265.897888 142.866409,262.118439 
	C146.915985,249.039917 147.305771,248.799622 159.929688,248.911133 
	C160.193558,248.913467 160.460175,248.602966 160.726059,248.424805 
	C160.726059,216.709290 160.726059,184.993759 160.726059,152.999283 
	C158.981964,152.999283 157.510361,153.004852 156.038818,152.998337 
	C148.494644,152.964981 146.842667,151.791733 144.451324,144.703583 
	C142.964935,140.297699 141.564316,135.861908 140.005447,131.482162 
	C139.650848,130.485855 138.801193,129.665741 138.179398,128.764542 
	C137.786041,128.919510 137.392670,129.074478 136.999298,129.229462 
	C136.999298,136.986313 136.999298,144.743179 136.999298,153.500000 
M352.999329,214.500000 
	C352.999329,225.925827 352.999329,237.351654 352.999329,249.000702 
	C354.901764,249.000702 356.213470,248.995712 357.525116,249.001526 
	C365.636383,249.037521 367.230713,250.175720 369.772888,257.810059 
	C371.189484,262.064056 372.515686,266.349365 374.012848,270.574402 
	C374.361542,271.558411 375.240082,272.354675 376.527100,274.144257 
	C376.527100,224.862869 376.527100,176.984222 376.527100,129.105576 
	C375.996033,128.957809 375.464966,128.810043 374.933899,128.662262 
	C373.571289,132.738937 372.198730,136.812302 370.847931,140.892868 
	C366.969055,152.610428 366.972351,152.607101 354.503265,153.044067 
	C354.062714,153.059509 353.631683,153.345718 352.999329,153.578064 
	C352.999329,173.581238 352.999329,193.540619 352.999329,214.500000 
M233.000702,220.500000 
	C233.000702,198.092850 233.000702,175.685684 233.000702,153.301041 
	C224.697906,153.301041 216.971741,153.301041 209.285538,153.301041 
	C209.285538,185.308441 209.285538,217.013245 209.285538,248.699188 
	C217.301941,248.699188 225.028259,248.699188 233.000702,248.699188 
	C233.000702,239.433197 233.000702,230.466599 233.000702,220.500000 
M280.999329,226.499969 
	C280.999329,233.923553 280.999329,241.347137 280.999329,248.679718 
	C289.341644,248.679718 297.068848,248.679718 304.695221,248.679718 
	C304.695221,216.652847 304.695221,184.947861 304.695221,153.320068 
	C296.658844,153.320068 288.931641,153.320068 280.999329,153.320068 
	C280.999329,177.593460 280.999329,201.546707 280.999329,226.499969 
M49.501663,192.999985 
	C44.072346,192.999985 38.643024,192.999985 33.282345,192.999985 
	C33.282345,257.326385 33.282345,321.055206 33.282345,384.702332 
	C35.976337,384.702332 38.379650,384.702332 41.000038,384.702332 
	C41.000038,382.594482 41.000038,380.782349 41.000038,378.970245 
	C41.000046,325.820892 40.995247,272.671539 41.005314,219.522171 
	C41.006805,211.649872 43.624790,209.028214 51.438473,209.004608 
	C58.540062,208.983154 65.641769,209.000061 72.711090,209.000061 
	C72.711090,203.374023 72.711090,198.306000 72.711090,192.999985 
	C65.116814,192.999985 57.809025,192.999985 49.501663,192.999985 
M465.496582,192.999985 
	C457.400909,192.999985 449.305267,192.999985 441.311279,192.999985 
	C441.311279,198.670822 441.311279,203.739471 441.311279,209.000015 
	C448.268219,209.000015 454.915100,208.995956 461.561981,209.001022 
	C470.717773,209.007980 472.998169,211.301971 472.998657,220.532867 
	C473.001434,273.514435 473.000000,326.495972 473.000000,379.477539 
	C473.000000,381.249908 473.000000,383.022278 473.000000,384.700562 
	C475.979675,384.700562 478.383057,384.700562 480.709656,384.700562 
	C480.709656,320.680664 480.709656,256.960632 480.709656,192.999985 
	C475.780212,192.999985 471.137634,192.999985 465.496582,192.999985 
M177.000000,245.340012 
	C177.167694,246.964920 176.173508,249.163605 179.378006,249.040512 
	C183.813934,248.870087 188.261307,248.997726 192.751221,248.997726 
	C192.751221,216.767990 192.751221,185.045181 192.751221,153.259674 
	C187.431381,153.259674 182.364029,153.259674 176.999985,153.259674 
	C176.999985,183.802521 176.999985,214.086639 177.000000,245.340012 
M259.406189,153.000015 
	C255.988983,153.000015 252.571777,153.000015 249.246735,153.000015 
	C249.246735,185.360306 249.246735,216.964233 249.246735,248.704559 
	C254.553650,248.704559 259.609985,248.704559 264.831482,248.704559 
	C264.831482,216.805878 264.831482,185.202591 264.831482,153.266479 
	C263.262512,153.172760 261.817108,153.086426 259.406189,153.000015 
M321.000000,160.566040 
	C321.000000,189.960007 321.000000,219.353973 321.000000,248.680756 
	C326.667816,248.680756 331.728088,248.680756 336.697113,248.680756 
	C336.697113,216.656204 336.697113,184.951767 336.697113,153.322586 
	C331.326294,153.322586 326.266327,153.322586 321.000000,153.322586 
	C321.000000,155.623962 321.000000,157.604156 321.000000,160.566040 
M114.670052,272.977448 
	C116.624588,272.977448 118.579132,272.977448 120.724182,272.977448 
	C120.724182,224.820419 120.724182,177.088776 120.724182,129.330002 
	C118.051033,129.330002 115.662567,129.330002 113.187431,129.330002 
	C113.109436,130.297058 113.011574,130.944839 113.011452,131.592651 
	C113.002991,177.592148 112.997246,223.591629 113.031815,269.591095 
	C113.032631,270.678223 113.492615,271.765015 114.670052,272.977448 
M401.000000,219.500000 
	C401.000000,189.433868 401.000000,159.367737 401.000000,129.320435 
	C398.037140,129.320435 395.646057,129.320435 393.281219,129.320435 
	C393.281219,177.325851 393.281219,225.010666 393.281219,272.679840 
	C395.965942,272.679840 398.354340,272.679840 401.000000,272.679840 
	C401.000000,255.074265 401.000000,237.787125 401.000000,219.500000 
M88.999283,169.500000 
	C88.999283,180.997391 88.999207,192.494797 88.999298,203.992188 
	C88.999458,223.821045 88.973366,243.649963 89.015587,263.478729 
	C89.028664,269.622162 91.290115,272.129059 96.726898,272.457550 
	C96.726898,224.730530 96.726898,176.999695 96.726898,128.947433 
	C91.392395,129.984619 88.996376,132.965164 88.998970,138.006882 
	C89.004189,148.171249 88.999741,158.335632 88.999283,169.500000 
M425.000671,180.500000 
	C425.000458,166.504013 425.035339,152.507904 424.983917,138.512100 
	C424.961334,132.367081 422.689392,129.846603 417.272827,129.545517 
	C417.272827,177.270126 417.272827,224.998352 417.272827,272.787140 
	C423.331238,271.415741 424.986206,269.321228 424.991302,262.976593 
	C425.013092,235.817749 425.000641,208.658859 425.000671,180.500000 
z"/>
<path fill="#FFC477" opacity="1.000000" stroke="none" 
	d="
M136.999298,153.000015 
	C136.999298,144.743179 136.999298,136.986313 136.999298,129.229462 
	C137.392670,129.074478 137.786041,128.919510 138.179398,128.764542 
	C138.801193,129.665741 139.650848,130.485855 140.005447,131.482162 
	C141.564316,135.861908 142.964935,140.297699 144.451324,144.703583 
	C146.842667,151.791733 148.494644,152.964981 156.038818,152.998337 
	C157.510361,153.004852 158.981964,152.999283 160.726059,152.999283 
	C160.726059,184.993759 160.726059,216.709290 160.725800,248.431610 
	C160.460175,248.602966 160.193558,248.913467 159.929688,248.911133 
	C147.305771,248.799622 146.915985,249.039917 142.866409,262.118439 
	C141.696152,265.897888 140.241516,269.589233 138.917267,273.320984 
	C138.277939,273.174774 137.638626,273.028564 136.999298,272.882355 
	C136.999298,233.088226 136.999298,193.294113 136.999298,153.000015 
z"/>
<path fill="#FFC477" opacity="1.000000" stroke="none" 
	d="
M352.999329,214.000000 
	C352.999329,193.540619 352.999329,173.581238 352.999329,153.578064 
	C353.631683,153.345718 354.062714,153.059509 354.503265,153.044067 
	C366.972351,152.607101 366.969055,152.610428 370.847931,140.892868 
	C372.198730,136.812302 373.571289,132.738937 374.933899,128.662262 
	C375.464966,128.810043 375.996033,128.957809 376.527100,129.105576 
	C376.527100,176.984222 376.527100,224.862869 376.527100,274.144257 
	C375.240082,272.354675 374.361542,271.558411 374.012848,270.574402 
	C372.515686,266.349365 371.189484,262.064056 369.772888,257.810059 
	C367.230713,250.175720 365.636383,249.037521 357.525116,249.001526 
	C356.213470,248.995712 354.901764,249.000702 352.999329,249.000702 
	C352.999329,237.351654 352.999329,225.925827 352.999329,214.000000 
z"/>
<path fill="#FFC477" opacity="1.000000" stroke="none" 
	d="
M233.000702,221.000000 
	C233.000702,230.466599 233.000702,239.433197 233.000702,248.699188 
	C225.028259,248.699188 217.301941,248.699188 209.285538,248.699188 
	C209.285538,217.013245 209.285538,185.308441 209.285538,153.301041 
	C216.971741,153.301041 224.697906,153.301041 233.000702,153.301041 
	C233.000702,175.685684 233.000702,198.092850 233.000702,221.000000 
z"/>
<path fill="#FFC477" opacity="1.000000" stroke="none" 
	d="
M280.999329,225.999969 
	C280.999329,201.546707 280.999329,177.593460 280.999329,153.320068 
	C288.931641,153.320068 296.658844,153.320068 304.695221,153.320068 
	C304.695221,184.947861 304.695221,216.652847 304.695221,248.679718 
	C297.068848,248.679718 289.341644,248.679718 280.999329,248.679718 
	C280.999329,241.347137 280.999329,233.923553 280.999329,225.999969 
z"/>
<path fill="#E0E0E2" opacity="1.000000" stroke="none" 
	d="
M50.001450,192.999985 
	C57.809025,192.999985 65.116814,192.999985 72.711090,192.999985 
	C72.711090,198.306000 72.711090,203.374023 72.711090,209.000061 
	C65.641769,209.000061 58.540062,208.983154 51.438473,209.004608 
	C43.624790,209.028214 41.006805,211.649872 41.005314,219.522171 
	C40.995247,272.671539 41.000046,325.820892 41.000038,378.970245 
	C41.000038,380.782349 41.000038,382.594482 41.000038,384.702332 
	C38.379650,384.702332 35.976337,384.702332 33.282345,384.702332 
	C33.282345,321.055206 33.282345,257.326385 33.282345,192.999985 
	C38.643024,192.999985 44.072346,192.999985 50.001450,192.999985 
z"/>
<path fill="#E0E0E2" opacity="1.000000" stroke="none" 
	d="
M465.995819,192.999985 
	C471.137634,192.999985 475.780212,192.999985 480.709656,192.999985 
	C480.709656,256.960632 480.709656,320.680664 480.709656,384.700562 
	C478.383057,384.700562 475.979675,384.700562 473.000000,384.700562 
	C473.000000,383.022278 473.000000,381.249908 473.000000,379.477539 
	C473.000000,326.495972 473.001434,273.514435 472.998657,220.532867 
	C472.998169,211.301971 470.717773,209.007980 461.561981,209.001022 
	C454.915100,208.995956 448.268219,209.000015 441.311279,209.000015 
	C441.311279,203.739471 441.311279,198.670822 441.311279,192.999985 
	C449.305267,192.999985 457.400909,192.999985 465.995819,192.999985 
z"/>
<path fill="#E0E0E2" opacity="1.000000" stroke="none" 
	d="
M177.000000,244.855377 
	C176.999985,214.086639 176.999985,183.802521 176.999985,153.259674 
	C182.364029,153.259674 187.431381,153.259674 192.751221,153.259674 
	C192.751221,185.045181 192.751221,216.767990 192.751221,248.997726 
	C188.261307,248.997726 183.813934,248.870087 179.378006,249.040512 
	C176.173508,249.163605 177.167694,246.964920 177.000000,244.855377 
z"/>
<path fill="#91DC5A" opacity="1.000000" stroke="none" 
	d="
M259.888947,153.000046 
	C261.817108,153.086426 263.262512,153.172760 264.831482,153.266479 
	C264.831482,185.202591 264.831482,216.805878 264.831482,248.704559 
	C259.609985,248.704559 254.553650,248.704559 249.246735,248.704559 
	C249.246735,216.964233 249.246735,185.360306 249.246735,153.000015 
	C252.571777,153.000015 255.988983,153.000015 259.888947,153.000046 
z"/>
<path fill="#FFDA44" opacity="1.000000" stroke="none" 
	d="
M321.000000,160.075195 
	C321.000000,157.604156 321.000000,155.623962 321.000000,153.322586 
	C326.266327,153.322586 331.326294,153.322586 336.697113,153.322586 
	C336.697113,184.951767 336.697113,216.656204 336.697113,248.680756 
	C331.728088,248.680756 326.667816,248.680756 321.000000,248.680756 
	C321.000000,219.353973 321.000000,189.960007 321.000000,160.075195 
z"/>
<path fill="#FF5023" opacity="1.000000" stroke="none" 
	d="
M114.204239,272.914703 
	C113.492615,271.765015 113.032631,270.678223 113.031815,269.591095 
	C112.997246,223.591629 113.002991,177.592148 113.011452,131.592651 
	C113.011574,130.944839 113.109436,130.297058 113.187431,129.330002 
	C115.662567,129.330002 118.051033,129.330002 120.724182,129.330002 
	C120.724182,177.088776 120.724182,224.820419 120.724182,272.977448 
	C118.579132,272.977448 116.624588,272.977448 114.204239,272.914703 
z"/>
<path fill="#FF9811" opacity="1.000000" stroke="none" 
	d="
M401.000000,220.000000 
	C401.000000,237.787125 401.000000,255.074265 401.000000,272.679840 
	C398.354340,272.679840 395.965942,272.679840 393.281219,272.679840 
	C393.281219,225.010666 393.281219,177.325851 393.281219,129.320435 
	C395.646057,129.320435 398.037140,129.320435 401.000000,129.320435 
	C401.000000,159.367737 401.000000,189.433868 401.000000,220.000000 
z"/>
<path fill="#FFC477" opacity="1.000000" stroke="none" 
	d="
M88.999283,169.000000 
	C88.999741,158.335632 89.004189,148.171249 88.998970,138.006882 
	C88.996376,132.965164 91.392395,129.984619 96.726898,128.947433 
	C96.726898,176.999695 96.726898,224.730530 96.726898,272.457550 
	C91.290115,272.129059 89.028664,269.622162 89.015587,263.478729 
	C88.973366,243.649963 88.999458,223.821045 88.999298,203.992188 
	C88.999207,192.494797 88.999283,180.997391 88.999283,169.000000 
z"/>
<path fill="#FFC477" opacity="1.000000" stroke="none" 
	d="
M425.000671,181.000000 
	C425.000641,208.658859 425.013092,235.817749 424.991302,262.976593 
	C424.986206,269.321228 423.331238,271.415741 417.272827,272.787140 
	C417.272827,224.998352 417.272827,177.270126 417.272827,129.545517 
	C422.689392,129.846603 424.961334,132.367081 424.983917,138.512100 
	C425.035339,152.507904 425.000458,166.504013 425.000671,181.000000 
z"/>
`;


  // ---------- SVG helpers ----------
  function svgEl(name, attrs = {}, className = "") {
    const el = document.createElementNS(SVG_NS, name);
    if (className) el.setAttribute("class", className);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  function clearSvg(node) {
    // Much faster than looping removeChild() and reduces mutation churn
    if (node && typeof node.replaceChildren === "function") {
      node.replaceChildren();
      return;
    }
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function wakeFor(ms = 1400) {
    masthead.classList.add("is-awake");
    window.clearTimeout(state.awakeTimer);
    state.awakeTimer = window.setTimeout(() => {
      masthead.classList.remove("is-awake");
    }, ms);
  }

  // ---------- URL matching for active nav ----------
  function normalizePath(urlLike) {
    try {
      const u = new URL(urlLike, window.location.origin);
      let p = (u.pathname || "/").replace(/\/+/g, "/");
      if (p.length > 1) p = p.replace(/\/$/, "");
      return p;
    } catch {
      return null;
    }
  }

  function currentPath() {
    let p = (window.location.pathname || "/").replace(/\/+/g, "/");
    if (p.length > 1) p = p.replace(/\/$/, "");
    return p;
  }

  function pickActiveFromLocation(ioMap) {
    const here = currentPath();
    for (const [id, el] of ioMap.entries()) {
      if (!el || el.tagName !== "A") continue;
      const href = el.getAttribute("href");
      if (!href) continue;

      const p = normalizePath(href);
      if (p && p === here) return id;
    }
    return null;
  }

  // ---------- DOM collection ----------
  function collectVisibleIO() {
    const all = Array.from(masthead.querySelectorAll(".pcb-io[data-pcb-id]"));
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
    const r = ioEl.getBoundingClientRect();
    const isIcon = ioEl.classList.contains("pcb-io--icon");
    const pad = 14; // more space than before → cleaner look

    const x = isIcon
      ? (r.right - mastRect.left) + pad
      : (r.left - mastRect.left) - pad;

    const y = (r.top - mastRect.top) + (r.height * 0.5);

    return {
      x: snap(clamp(x, 0, w)),
      y: snap(clamp(y, 0, h))
    };
  }

  function cpuBox(cpuEl, mastRect, w, h) {
    if (!cpuEl) {
      return { x: snap(w * 0.10), y: snap(h * 0.25), w: snap(w * 0.18), h: snap(h * 0.50) };
    }
    const r = cpuEl.getBoundingClientRect();
    const x = snap(clamp(r.left - mastRect.left, 0, w));
    const y = snap(clamp(r.top - mastRect.top, 0, h));
    const ww = snap(clamp(r.width, 10, w));
    const hh = snap(clamp(r.height, 10, h));
    return { x, y, w: ww, h: hh };
  }

  function cpuPinsPerimeter(box, w, h, counts, opts = {}) {
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

      // length/(count+1) >= minPitch  => count <= length/minPitch - 1
      const max = Math.max(1, Math.floor(L / minPitch) - 1);
      return Math.max(1, Math.min(requested, max));
    }

    function pinLine(count, a0, a1, fixed, horizontal) {
      if (count <= 0) return [];
      const pts = [];
      for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        const v = lerp(a0, a1, t);
        pts.push(horizontal
          ? { x: snap(clamp(v, 0, w)), y: snap(clamp(fixed, 0, h)) }
          : { x: snap(clamp(fixed, 0, w)), y: snap(clamp(v, 0, h)) }
        );
      }
      return pts;
    }

    const topCount    = fitCount(counts.top,    safeX0, safeX1);
    const bottomCount = fitCount(counts.bottom, safeX0, safeX1);
    const leftCount   = fitCount(counts.left,   safeY0, safeY1);
    const rightCount  = fitCount(counts.right,  safeY0, safeY1);

    return {
      top:    pinLine(topCount,    safeX0, safeX1, box.y - out, true),
      right:  pinLine(rightCount,  safeY0, safeY1, box.x + box.w + out, false),
      bottom: pinLine(bottomCount, safeX0, safeX1, box.y + box.h + out, true),
      left:   pinLine(leftCount,   safeY0, safeY1, box.x - out, false)
    };
  }


  // ---------- SVG defs ----------
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

  function computeComponentBox(comp) {
    const scale = comp.scale ?? 1;
    const ww = snap(comp.ww * scale);
    const hh = snap(comp.hh * scale);
    const x = snap(comp.x - (ww - comp.ww) / 2);
    const y = snap(comp.y - (hh - comp.hh) / 2);
    return { x, y, ww, hh };
  }

  // ---------- Decorative silkscreen (parallax-safe) ----------
  function buildResistorSilkscreen(parent, comp) {
    const resistor = svgEl("svg", {
      x: snap(comp.x),
      y: snap(comp.y),
      width: snap(comp.ww),
      height: snap(comp.hh),
      viewBox: "0 0 512 512",
      preserveAspectRatio: "xMidYMid meet"
    }, "pcb-component pcb-component--resistor");

    resistor.innerHTML = RESISTOR_SVG_CONTENT;
    parent.appendChild(resistor);
  }

  function buildSilkscreen(svgRoot, w, h) {
    const g = svgEl("g", {}, "pcb-decor");
    state.decorG = g;

    const comps = [
      { x: w * 0.18, y: h * 0.78, ww: 36, hh: 14, label: "R1" },
      { x: w * 0.34, y: h * 0.70, ww: 36, hh: 12, label: "C3", type: "resistor", scale: 5 },
      { x: w * 0.56, y: h * 0.80, ww: 40, hh: 14, label: "U2" },
      { x: w * 0.74, y: h * 0.70, ww: 52, hh: 16, label: "LDO" }
    ];

    for (const c of comps) {
      const dims = computeComponentBox(c);

      if (c.type === "resistor") {
        buildResistorSilkscreen(g, dims);
      } else {
        g.appendChild(svgEl("rect", {
          x: dims.x, y: dims.y,
          width: dims.ww, height: dims.hh
        }, "pcb-component"));
      }

      const t = svgEl("text", { x: snap(dims.x + dims.ww * 0.5), y: snap(dims.y - 8) }, "pcb-label");
      t.textContent = c.label;
      g.appendChild(t);
    }

    svgRoot.appendChild(g);
  }

  // ---------- Bus building ----------
  function busPath(x0, x1, y, amp = 4) {
    const dx = x1 - x0;
    return [
      `M ${x0} ${y}`,
      `C ${snap(x0 + dx * 0.22)} ${snap(y - amp)}, ${snap(x0 + dx * 0.38)} ${snap(y + amp)}, ${snap(x0 + dx * 0.54)} ${y}`,
      `S ${snap(x0 + dx * 0.82)} ${snap(y - amp)}, ${x1} ${y}`
    ].join(" ");
  }

  function buildBus(parent, key, x0, x1, y, amp = 4) {
    const g = svgEl("g", {}, `pcb-bus pcb-bus--${key}`);
    g.dataset.pcbBus = key;

    const d = busPath(x0, x1, y, amp);

    g.appendChild(svgEl("path", { d }, "pcb-bus--base"));
    g.appendChild(svgEl("path", { d }, "pcb-bus--gold"));

    const sig = svgEl("path", { d }, "pcb-bus--signal is-pulse");
    sig.style.setProperty("--bus-speed", `${950 + Math.random() * 950}ms`);
    g.appendChild(sig);

    parent.appendChild(g);
    state.buses.set(key, { g, y, x0, x1 });
    return { g, y, x0, x1 };
  }

  function buildRail(parent, key, x, y0, y1) {
    const g = svgEl("g", {}, `pcb-bus pcb-bus--${key}`);
    g.dataset.pcbBus = key;

    const d = `M ${x} ${y0} L ${x} ${y1}`;

    g.appendChild(svgEl("path", { d }, "pcb-bus--base"));
    g.appendChild(svgEl("path", { d }, "pcb-bus--gold"));

    const sig = svgEl("path", { d }, "pcb-bus--signal is-pulse");
    sig.style.setProperty("--bus-speed", `${1200 + Math.random() * 900}ms`);
    g.appendChild(sig);

    parent.appendChild(g);
    state.buses.set(key, { g, y: null, x0: x, x1: x });
    return { g, x };
  }

  // ---------- Routing (rounded V→H corner) ----------
  function routeVH(start, end, r = 10) {
    const sx = start.x, sy = start.y;
    const ex = end.x, ey = end.y;

    const dy = ey - sy;
    const dx = ex - sx;

    if (Math.abs(dy) < r * 2 || Math.abs(dx) < r * 2) {
      return `M ${sx} ${sy} L ${sx} ${ey} L ${ex} ${ey}`;
    }

    const signY = dy >= 0 ? 1 : -1;
    const signX = dx >= 0 ? 1 : -1;

    const y1 = snap(ey - signY * r);
    const x2 = snap(sx + signX * r);

    return [
      `M ${sx} ${sy}`,
      `L ${sx} ${y1}`,
      `Q ${sx} ${ey} ${x2} ${ey}`,
      `L ${ex} ${ey}`
    ].join(" ");
  }

  // ---------- Sparks / via blink ----------
  function buildSparksLayer(svgRoot) {
    const sparks = svgEl("g", {}, "pcb-sparks");
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

  function spawnSparks(x, y, kind = "star", count = 6) {
    if (!state.sparkLayer || prefersReducedMotion) return;

    for (let i = 0; i < count; i++) {
      const holder = svgEl("g", { transform: `translate(${x} ${y})` });

      const dx = (Math.random() * 42 - 21);
      const dy = -(8 + Math.random() * 30);
      const rot = (60 + Math.random() * 140) + "deg";
      const life = (700 + Math.random() * 520) + "ms";

      let shape;
      if (kind === "heart") {
        shape = svgEl("path", { d: heartPath(5.2) }, "pcb-spark pcb-spark--heart");
        shape.style.setProperty("--spark-fill", "var(--pcb-spark-pink)");
      } else {
        shape = svgEl("path", { d: "M 0 -4 L 4 0 L 0 4 L -4 0 Z" }, "pcb-spark");
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

  function blinkViasRun(meta) {
    if (!meta || !meta.vias || prefersReducedMotion) return;

    meta.vias.forEach(v => v.classList.remove("is-blink"));
    meta.vias.forEach((via, i) => {
      window.setTimeout(() => {
        via.classList.add("is-blink");
        window.setTimeout(() => via.classList.remove("is-blink"), 1800);
      }, i * 110);
    });
  }

  // ---------- Net building ----------

  function buildNet(parent, id, d, end, opts = {}) {
    const g = svgEl("g", {}, "pcb-net");
    g.dataset.pcbId = id;

    if (opts.playful) g.classList.add("is-playful");
    g.style.setProperty("--trace-speed", opts.speed || `${760 + Math.random() * 680}ms`);
    if (opts.color) g.style.setProperty("--trace-color", opts.color);

    const base = svgEl("path", { d }, "pcb-trace--base");
    const hi   = svgEl("path", { d }, "pcb-trace--highlight");
    const sig  = svgEl("path", { d }, "pcb-trace--signal");

    g.appendChild(base);
    g.appendChild(hi);
    g.appendChild(sig);

    const vias = [];
    if (opts.vias) {
      for (const pt of opts.vias) {
        const via = svgEl("circle", { cx: pt.x, cy: pt.y, r: 3.05 }, "pcb-via");
        g.appendChild(via);
        vias.push(via);
      }
    }

    if (opts.endPad !== false) {
      const endPadR = opts.endPadR ?? 4.7;
      const endPadClass = opts.endPadClass ?? "pcb-pad";
      g.appendChild(svgEl("circle", { cx: end.x, cy: end.y, r: endPadR }, endPadClass));
    }

    parent.appendChild(g);

    // Allow decorative nets to skip registration if desired
    if (opts.register !== false) {
      state.nets.set(id, { g, end, vias, busKey: opts.busKey || null });
    }

    return g;
  }




  function displayedId() {
    return state.hoverId || state.activeId;
  }

  function applyActiveVisuals() {
    const id = displayedId();

    // IO chips
    for (const [key, el] of state.ioMap.entries()) {
      if (!el) continue;
      el.classList.toggle("is-active", key === id);
    }

    // Nets
    for (const [key, meta] of state.nets.entries()) {
      meta.g.classList.toggle("is-active", key === id);
    }

    // Buses: light up the one feeding the active net
    for (const [, bus] of state.buses.entries()) {
      bus.g && bus.g.classList && bus.g.classList.remove("is-hot");
    }
    if (id && state.nets.has(id)) {
      const busKey = state.nets.get(id).busKey;
      if (busKey && state.buses.has(busKey)) {
        state.buses.get(busKey).g.classList.add("is-hot");
      }
    }
  }

  function setHover(id) {
    state.hoverId = id;
    wakeFor(1400);
    applyActiveVisuals();

    const meta = state.nets.get(id);
    if (meta) {
      blinkViasRun(meta);
      spawnSparks(meta.end.x, meta.end.y, "star", 6);
    }
  }

  function clearHover() {
    state.hoverId = null;
    applyActiveVisuals();
  }

  // ---------- Build / layout ----------
  function rebuild() {
    state.rebuilding = true;
    try {
      const mastRect = masthead.getBoundingClientRect();
      const w = Math.max(1, Math.floor(mastRect.width));
      const h = Math.max(1, Math.floor(mastRect.height));

      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");

      clearSvg(svg);
      state.nets.clear();
      state.buses.clear();
      state.ioMap = collectVisibleIO();

      addDefs(svg);
      buildSilkscreen(svg, w, h);

      // ---- Backbones (static, spaced, visible)
      const backbones = svgEl("g", {}, "pcb-backbones");
      svg.appendChild(backbones);

      const x0 = snap(w * 0.05);
      const x1 = snap(w * 0.95);

      // top + bottom buses near edges (keeps middle clean behind nav text)
      let yTop = snap(clamp(h * 0.20, 10, 18));
      let yBot = snap(clamp(h * 0.82, h - 18, h - 10));
      if (yBot - yTop < 26) {
        const mid = h * 0.5;
        yTop = snap(mid - 13);
        yBot = snap(mid + 13);
      }

      const busTop = buildBus(backbones, "top", x0, x1, yTop, 3.5);
      const busBot = buildBus(backbones, "bottom", x0, x1, yBot, 3.5);

      // left rail (power/ground vibe) — ensures left side is “wired”
      const cBox = cpuBox(cpu, mastRect, w, h);
      const railX = snap(clamp(cBox.x - 28, 10, cBox.x - 10));
      buildRail(backbones, "rail", railX, yTop, yBot);

      // ---- Traces group (actual interactive nets)
      const traces = svgEl("g", {}, "pcb-traces");
      svg.appendChild(traces);

      // CPU pins on all 4 sides (visible)
      const totalPins = clamp(state.ioMap.size + 6, 10, 18);
      const counts = {
        top: 3,
        bottom: 3,
        left: 3,
        right: Math.max(3, totalPins - 9)
      };
      const pins = cpuPinsPerimeter(cBox, w, h, counts);

      // pin pads
      const pinPads = svgEl("g", {}, "pcb-pins");
      traces.appendChild(pinPads);

      [...pins.top, ...pins.right, ...pins.bottom, ...pins.left].forEach((p) => {
        pinPads.appendChild(
          svgEl("circle", { cx: p.x, cy: p.y, r: CPU_PIN_R }, "pcb-pad pcb-pad--pin")
        );
      });


      // connect CPU pins into buses/rail (so top/bottom/left are genuinely connected)
      // - top pins → top bus
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

      // - bottom pins → bottom bus
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

      // - left pins → rail
      pins.left.slice(0, 2).forEach((p, i) => {
        const end = { x: railX, y: p.y };
        // simple horizontal is fine here
        const d = `M ${p.x} ${p.y} L ${end.x} ${end.y}`;
        buildNet(traces, `__cpu_left_${i}`, d, end, {
          busKey: "rail",
          endPad: false,
          register: false
        });
      });

      // ---- IO targets
      const targets = [];
      for (const [id, el] of state.ioMap.entries()) {
        targets.push({
          id,
          el,
          end: pointForIO(el, mastRect, w, h)
        });
      }

      // Sort by X and alternate buses for guaranteed separation
      targets.sort((a, b) => a.end.x - b.end.x);

      const approach = 16; // last segment into pad (gives clean “pad entry”)
      targets.forEach((t, i) => {
        const busKey = (i % 2 === 0) ? "top" : "bottom";
        const bus = (busKey === "top") ? busTop : busBot;

        // tap point on the bus, slightly left of the end pad
        const tapX = snap(clamp(t.end.x - approach, x0 + 24, x1 - 24));
        const start = { x: tapX, y: bus.y };
        const end = t.end;

        // two vias: bus tap + corner
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

      buildSparksLayer(svg);

      state.activeId = pickActiveFromLocation(state.ioMap);
      applyActiveVisuals();

      // Let MutationObserver microtasks flush before allowing another rebuild trigger
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
    // Debounce bursts of resize/mutation events (prevents stutter + animation resets)
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


  // ---------- Idle pulses ----------
  function startIdlePulses() {
    stopIdlePulses();
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

      if (Math.random() < 0.25) spawnSparks(meta.end.x, meta.end.y, "star", 5);
    }, 2100);
  }

  function stopIdlePulses() {
    if (state.idleInterval) window.clearInterval(state.idleInterval);
    state.idleInterval = 0;
  }

  // ---------- Cute random CPU face blink ----------
  function startRandomBlink() {
    stopRandomBlink();
    if (!cpuFace || prefersReducedMotion) return;

    const loop = () => {
      if (!state.inView) {
        state.blinkTimer = window.setTimeout(loop, 1200);
        return;
      }

      const wait = 4200 + Math.random() * 5200;
      state.blinkTimer = window.setTimeout(() => {
        cpuFace.classList.add("is-blink");
        window.setTimeout(() => cpuFace.classList.remove("is-blink"), 520);
        loop();
      }, wait);
    };

    loop();
  }

  function stopRandomBlink() {
    if (state.blinkTimer) window.clearTimeout(state.blinkTimer);
    state.blinkTimer = 0;
  }

  // ---------- Events ----------
  function wireEvents() {
    masthead.addEventListener("pointerover", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;
      setHover(io.dataset.pcbId);
    });

    masthead.addEventListener("pointerout", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;

      const to = ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest(".pcb-io[data-pcb-id]");
      if (to) return;

      clearHover();
    });

    masthead.addEventListener("focusin", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;
      setHover(io.dataset.pcbId);
    });

    masthead.addEventListener("focusout", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;
      clearHover();
    });

    // Click sparks (cute)
    masthead.addEventListener("pointerdown", (ev) => {
      const io = ev.target.closest && ev.target.closest(".pcb-io[data-pcb-id]");
      if (!io) return;

      const id = io.dataset.pcbId;
      const meta = state.nets.get(id);
      if (meta) spawnSparks(meta.end.x, meta.end.y, "heart", 7);
      wakeFor(1800);
    });
  }

  function wireObservers() {
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => scheduleRebuild());
      ro.observe(masthead);
    } else {
      window.addEventListener("resize", scheduleRebuild);
    }

    if ("MutationObserver" in window) {
      // Prefer watching the container that holds the IO links, not the whole masthead.
      const nav =
        masthead.querySelector("#site-nav") ||
        masthead.querySelector(".greedy-nav") ||
        masthead.querySelector(".pcb-io[data-pcb-id]")?.closest("nav, ul, ol") ||
        null;

      // If we couldn't find a safe container, fall back to masthead,
      // BUT we will ignore SVG-originating mutations in the callback.
      const root = (nav && !nav.contains(svg)) ? nav : masthead;

      const mo = new MutationObserver((mutations) => {
        // Prevent rebuild() -> SVG mutations -> MO -> rebuild() loops
        if (state.rebuilding) return;

        // Ignore mutations caused by the SVG rebuild itself
        const meaningful = mutations.some((m) => !svg.contains(m.target));
        if (!meaningful) return;

        scheduleRebuild();
      });

      mo.observe(root, { childList: true, subtree: true });
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

      io.observe(masthead);
    }
  }

  // ---------- Init ----------
  rebuild();
  wireEvents();
  wireObservers();
  startIdlePulses();
  startRandomBlink();

  window.addEventListener("load", scheduleRebuild);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleRebuild);
  } else {
    window.setTimeout(scheduleRebuild, 250);
  }

})();
