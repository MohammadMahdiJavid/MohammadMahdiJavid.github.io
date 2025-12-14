
(function () {
  'use strict';

  const root = document.querySelector('[data-pcb-masthead]');
  if (!root) return;

  const svg = root.querySelector('.pcb-masthead__traces');
  const cpu = root.querySelector('#pcb-cpu');
  if (!svg || !cpu) return;

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * A tiny debounce so resize/mutation rebuilds don't thrash.
   */
  function debounce(fn, ms = 120) {
    let t = null;
    return function (...args) {
      window.clearTimeout(t);
      t = window.setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function svgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  /**
   * Build a 45°-corner "PCB route" polyline and turn it into a chamfered SVG path.
   * Points are expected to be axis-aligned segments (H/V); corners are chamfered.
   */
  function chamferPath(points, baseCut = 10) {
    if (!points || points.length < 2) return '';

    const p0 = points[0];
    let d = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)}`;

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      const colinear = (dx1 === 0 && dx2 === 0) || (dy1 === 0 && dy2 === 0);
      if (colinear) {
        d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
        continue;
      }

      const len1 = Math.hypot(dx1, dy1);
      const len2 = Math.hypot(dx2, dy2);
      if (len1 === 0 || len2 === 0) {
        d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
        continue;
      }

      const cut = Math.min(baseCut, len1 / 2, len2 / 2);
      const ux1 = dx1 / len1;
      const uy1 = dy1 / len1;
      const ux2 = dx2 / len2;
      const uy2 = dy2 / len2;

      const a = { x: curr.x - ux1 * cut, y: curr.y - uy1 * cut };
      const b = { x: curr.x + ux2 * cut, y: curr.y + uy2 * cut };

      d += ` L ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }

    const pn = points[points.length - 1];
    d += ` L ${pn.x.toFixed(1)} ${pn.y.toFixed(1)}`;
    return d;
  }

  /**
   * Compute a route with several bends to feel "engineered".
   */
  function computeRoute(start, end, idx, total, headerW, headerH) {
    const margin = 10;

    // Build an extra "lane" so traces don't perfectly overlap.
    const spread = clamp(12, 8, headerH / 3);
    const yLane = clamp(
      headerH / 2 + (idx - (total - 1) / 2) * spread,
      margin,
      headerH - margin
    );

    const xOut = start.x + 22;
    const xIn = end.x - 12;

    // If there's not enough horizontal room (small screens / collapsed nav), fallback.
    if (xIn - xOut < 34) {
      const xMid = (start.x + end.x) / 2;
      return [
        start,
        { x: xMid, y: start.y },
        { x: xMid, y: end.y },
        end
      ];
    }

    return [
      start,
      { x: xOut, y: start.y },
      { x: xOut, y: yLane },
      { x: xIn, y: yLane },
      { x: xIn, y: end.y },
      end
    ];
  }

  /**
   * Assign slightly different signal personality per link.
   */
  function netStyleFor(id, idx) {
    const key = (id || '').toLowerCase();
    if (key.includes('hobbies')) {
      return { color: 'rgba(255, 140, 230, 0.95)', speed: '880ms', playful: true };
    }
    if (key === 'cv' || key.includes('resume')) {
      return { color: 'rgba(110, 255, 210, 0.96)', speed: '680ms', playful: false };
    }
    if (key.includes('projects') || key.includes('portfolio')) {
      return { color: 'rgba(120, 210, 255, 0.92)', speed: '760ms', playful: false };
    }
    // Gentle variety without being random-chaotic.
    const palette = [
      'rgba(110, 255, 210, 0.96)',
      'rgba(120, 210, 255, 0.92)',
      'rgba(255, 220, 140, 0.92)'
    ];
    return { color: palette[idx % palette.length], speed: '820ms', playful: false };
  }

  let netMap = new Map();
  let lastActive = null;
  let heartbeatTimer = null;
  let viaBlinkTimer = null;
  let decorGroup = null;
  let busSignal = null;
  const silkLabels = ['DATA0', 'CLK', 'RST', 'IO1', 'UART', 'SPI', 'CAN', 'I2C', 'DBG', 'BUS'];

  function pulseNet(net, className = 'is-heartbeat', duration = 1100) {
    if (!net || prefersReducedMotion) return;
    net.classList.add(className);
    window.setTimeout(() => net.classList.remove(className), duration);
  }

  function pulseBus(speed = 1500) {
    if (!busSignal || prefersReducedMotion) return;
    busSignal.style.setProperty('--bus-speed', `${speed}ms`);
    busSignal.classList.add('is-pulse');
    window.setTimeout(() => busSignal && busSignal.classList.remove('is-pulse'), speed);
  }

  function getLinks() {
    // Only trace the currently visible links (greedy-nav can move items around).
    const links = Array.from(root.querySelectorAll('.pcb-io'))
      .filter(a => a.offsetParent !== null);
    return links;
  }

  function clearSvg() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    decorGroup = null;
    busSignal = null;
  }

  function buildDecorations(headerRect, baseStart, meta = []) {
    const decor = svgEl('g');
    decor.setAttribute('class', 'pcb-decor');

    const busMargin = 12;
    const busY = clamp(baseStart.y + 10, 14, headerRect.height - 18);
    const busPath = `M ${busMargin} ${busY.toFixed(1)} H ${(headerRect.width - busMargin).toFixed(1)}`;

    const busBase = svgEl('path');
    busBase.setAttribute('class', 'pcb-bus pcb-bus--base');
    busBase.setAttribute('d', busPath);

    busSignal = svgEl('path');
    busSignal.setAttribute('class', 'pcb-bus pcb-bus--signal');
    busSignal.setAttribute('d', busPath);

    decor.appendChild(busBase);
    decor.appendChild(busSignal);

    const labelPositions = meta.length ? meta : [{ start: baseStart, end: { x: headerRect.width - busMargin, y: busY } }];
    labelPositions.slice(0, silkLabels.length).forEach((item, idx) => {
      const label = svgEl('text');
      label.setAttribute('class', 'pcb-label');
      const midX = item ? (item.start.x + item.end.x) / 2 : headerRect.width * 0.5;
      const midY = busY - 12 - (idx % 2 === 0 ? 0 : 8);
      label.setAttribute('x', midX.toFixed(1));
      label.setAttribute('y', midY.toFixed(1));
      label.textContent = silkLabels[idx];
      decor.appendChild(label);
    });

    const components = [
      { x: headerRect.width * 0.08, y: busY - 26, w: 32, h: 9 },
      { x: headerRect.width * 0.22, y: busY + 12, w: 22, h: 8, tiny: true },
      { x: headerRect.width * 0.46, y: busY - 18, w: 28, h: 10 },
      { x: headerRect.width * 0.66, y: busY + 10, w: 26, h: 9 },
      { x: headerRect.width * 0.82, y: busY - 22, w: 20, h: 8, tiny: true }
    ];

    components.forEach(c => {
      const rect = svgEl('rect');
      rect.setAttribute('class', `pcb-component${c.tiny ? ' pcb-component--tiny' : ''}`);
      rect.setAttribute('x', c.x.toFixed(1));
      rect.setAttribute('y', c.y.toFixed(1));
      rect.setAttribute('width', c.w.toFixed(1));
      rect.setAttribute('height', c.h.toFixed(1));
      decor.appendChild(rect);

      const line = svgEl('line');
      line.setAttribute('class', 'pcb-component-line');
      line.setAttribute('x1', (c.x - 10).toFixed(1));
      line.setAttribute('y1', (c.y + c.h / 2).toFixed(1));
      line.setAttribute('x2', (c.x - 2).toFixed(1));
      line.setAttribute('y2', (c.y + c.h / 2).toFixed(1));
      decor.appendChild(line);
    });

    svg.insertBefore(decor, svg.firstChild || null);
    decorGroup = decor;
  }

  function rebuildTraces() {
    const links = getLinks();
    netMap = new Map();

    const headerRect = root.getBoundingClientRect();
    const cpuRect = cpu.getBoundingClientRect();

    // If header is collapsed or hidden, skip.
    if (headerRect.width < 10 || headerRect.height < 10) return;

    svg.setAttribute('viewBox', `0 0 ${headerRect.width} ${headerRect.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    clearSvg();

    // Base start point: slightly to the right of the CPU chip.
    // Each net gets a small Y offset so it looks like individual chip pins.
    const baseStart = {
      x: clamp(cpuRect.right - headerRect.left + 6, 6, headerRect.width - 6),
      y: clamp(cpuRect.top - headerRect.top + cpuRect.height / 2, 6, headerRect.height - 6)
    };

    const meta = [];

    links.forEach((a, idx) => {
      const id = a.dataset.pcbId || `io-${idx}`;
      const r = a.getBoundingClientRect();

      const end = {
        x: clamp(r.left - headerRect.left - 10, 6, headerRect.width - 6),
        y: clamp(r.top - headerRect.top + r.height / 2, 6, headerRect.height - 6)
      };

      const start = {
        x: baseStart.x,
        y: clamp(
          baseStart.y + (idx - (links.length - 1) / 2) * 3.2,
          6,
          headerRect.height - 6
        )
      };

      const points = computeRoute(start, end, idx, links.length, headerRect.width, headerRect.height);
      const d = chamferPath(points, 10);

      meta.push({ start, end });

      const net = svgEl('g');
      net.setAttribute('class', 'pcb-net');
      net.dataset.net = id;

      const base = svgEl('path');
      base.setAttribute('class', 'pcb-trace--base');
      base.setAttribute('d', d);

      const sig = svgEl('path');
      sig.setAttribute('class', 'pcb-trace--signal');
      sig.setAttribute('d', d);

      const viaStart = svgEl('circle');
      viaStart.setAttribute('class', 'pcb-via');
      viaStart.setAttribute('cx', start.x.toFixed(1));
      viaStart.setAttribute('cy', start.y.toFixed(1));
      viaStart.setAttribute('r', '2.2');

      const viaEnd = svgEl('circle');
      viaEnd.setAttribute('class', 'pcb-via');
      viaEnd.setAttribute('cx', end.x.toFixed(1));
      viaEnd.setAttribute('cy', end.y.toFixed(1));
      viaEnd.setAttribute('r', '2.2');

      const style = netStyleFor(id, idx);
      net.style.setProperty('--trace-color', style.color);
      net.style.setProperty('--trace-speed', style.speed);
      if (style.playful) net.classList.add('is-playful');

      net.appendChild(base);
      net.appendChild(sig);
      net.appendChild(viaStart);
      net.appendChild(viaEnd);
      svg.appendChild(net);

      netMap.set(id, { net, link: a, start, end });
    });

    buildDecorations(headerRect, baseStart, meta);
  }

  function setActive(id) {
    if (!id || !netMap.has(id)) return;
    if (lastActive && lastActive !== id) clearActive(lastActive);
    lastActive = id;

    const item = netMap.get(id);
    item.net.classList.remove('is-heartbeat', 'is-idle');
    item.net.classList.add('is-active');
    item.link.classList.add('is-active');
    pulseNet(item.net, 'is-heartbeat', 900);
  }

  function clearActive(id) {
    const item = netMap.get(id);
    if (!item) return;
    item.net.classList.remove('is-active', 'is-heartbeat', 'is-idle');
    item.link.classList.remove('is-active');
    if (lastActive === id) lastActive = null;
  }

  function attachInteractions() {
    const links = getLinks();
    links.forEach(a => {
      const id = a.dataset.pcbId;
      if (!id) return;

      // Prevent duplicate listeners across rebuilds.
      if (a.dataset.pcbBound === '1') return;
      a.dataset.pcbBound = '1';

      a.addEventListener('mouseenter', () => setActive(id));
      a.addEventListener('mouseleave', () => clearActive(id));
      a.addEventListener('focus', () => setActive(id));
      a.addEventListener('blur', () => clearActive(id));
    });

    const current = links.find(a => a.classList.contains('current') || a.getAttribute('aria-current') === 'page');
    if (current && current.dataset.pcbId) {
      setActive(current.dataset.pcbId);
    }
  }

  function scheduleHeartbeat() {
    if (prefersReducedMotion) return;
    if (heartbeatTimer) window.clearTimeout(heartbeatTimer);

    const beat = () => {
      const keys = Array.from(netMap.keys());
      if (keys.length === 0) return;

      // Avoid pulsing the currently active net too often.
      let pick = keys[Math.floor(Math.random() * keys.length)];
      if (lastActive && keys.length > 1 && Math.random() < 0.6) {
        const alt = keys.filter(k => k !== lastActive);
        pick = alt[Math.floor(Math.random() * alt.length)];
      }

      const item = netMap.get(pick);
      if (item) {
        pulseNet(item.net, 'is-idle', 1200);
      }

      if (Math.random() < 0.65) {
        pulseBus(1500 + Math.random() * 400);
      }

      // Next beat in ~2s–4s
      heartbeatTimer = window.setTimeout(beat, 2000 + Math.random() * 2000);
    };

    heartbeatTimer = window.setTimeout(beat, 1600 + Math.random() * 900);
  }

  function blinkVias() {
    if (prefersReducedMotion) return;
    if (viaBlinkTimer) window.clearTimeout(viaBlinkTimer);

    const blink = () => {
      const vias = Array.from(svg.querySelectorAll('.pcb-via'));
      if (vias.length === 0) return;
      const pick = vias[Math.floor(Math.random() * vias.length)];
      pick.classList.add('is-blink');
      window.setTimeout(() => pick.classList.remove('is-blink'), 1400);
      viaBlinkTimer = window.setTimeout(blink, 2600 + Math.random() * 2600);
    };

    viaBlinkTimer = window.setTimeout(blink, 2000 + Math.random() * 1200);
  }

  function fanoutFromCpu() {
    if (prefersReducedMotion) return;
    const keys = Array.from(netMap.keys());
    keys.forEach((id, idx) => {
      const item = netMap.get(id);
      window.setTimeout(() => {
        if (!item) return;
        pulseNet(item.net, 'is-heartbeat', 1100);
      }, idx * 140);
    });
    pulseBus(1200);
  }

  const rebuildAll = debounce(() => {
    rebuildTraces();
    attachInteractions();
    scheduleHeartbeat();
    blinkVias();
  }, 90);

  // Hovering your name (CPU) gently animates all non-active nets.
  cpu.addEventListener('mouseenter', () => {
    root.classList.add('is-cpu-hover');
    fanoutFromCpu();
  });
  cpu.addEventListener('mouseleave', () => root.classList.remove('is-cpu-hover'));
  cpu.addEventListener('focus', () => {
    root.classList.add('is-cpu-hover');
    fanoutFromCpu();
  });
  cpu.addEventListener('blur', () => root.classList.remove('is-cpu-hover'));

  // Initial build after layout is stable.
  window.addEventListener('load', () => {
    rebuildAll();

    // A second rebuild catches late font/layout shifts.
    window.setTimeout(rebuildAll, 350);
  });

  window.addEventListener('resize', rebuildAll);

  // Watch greedy-nav reshuffles.
  const visibleLinks = root.querySelector('.visible-links');
  if (window.MutationObserver && visibleLinks) {
    const mo = new MutationObserver(rebuildAll);
    mo.observe(visibleLinks, { childList: true, subtree: true });
  }

  // If available, a ResizeObserver is a bit more reliable than window resize.
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(rebuildAll);
    ro.observe(root);
  }
})();

