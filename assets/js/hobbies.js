
/*
  Hobbies page interactive graph (Cytoscape.js + dagre layout)
  - Page-scoped: only runs if #hobbies-flowchart exists
  - Designed to be “job relevant” for embedded / hardware roles
*/

/* global cytoscape, cytoscapeDagre */

(function () {
  const container = document.getElementById('hobbies-flowchart');
  if (!container) return;

  const titleEl = document.getElementById('hobby-title');
  const bodyEl = document.getElementById('hobby-body');
  const tooltipEl = document.getElementById('hobbies-tooltip');
  const searchInput = document.getElementById('hobbies-search');
  const searchStatus = document.getElementById('hobbies-search-status');
  const btnReset = document.getElementById('hobbies-reset');
  const btnFit = document.getElementById('hobbies-fit');
  const btnPng = document.getElementById('hobbies-png');

  const isDark = () =>
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  const palette = () => {
    if (isDark()) {
      return {
        text: '#E5E7EB',
        muted: '#A1A1AA',
        border: '#334155',
        node: '#0F172A',
        node2: '#111827',
        hub: '#0EA5E9',
        cat: '#22C55E',
        sec: '#A78BFA',
        auto: '#F59E0B',
        edge: '#94A3B8',
        edge2: '#CBD5E1'
      };
    }

    return {
      text: '#0F172A',
      muted: '#475569',
      border: '#94A3B8',
      node: '#F8FAFC',
      node2: '#FFFFFF',
      hub: '#0284C7',
      cat: '#16A34A',
      sec: '#7C3AED',
      auto: '#CA8A04',
      edge: '#64748B',
      edge2: '#334155'
    };
  };

  // Register layout plugin if available.
  try {
    if (typeof cytoscape !== 'undefined' && typeof cytoscapeDagre !== 'undefined') {
      cytoscape.use(cytoscapeDagre);
    }
  } catch (e) {
    // ignore
  }

  // If the dagre layout plugin isn't available (network blocked, CDN down, ...),
  // fall back to a built-in layout so the page still renders something useful.
  const layoutName = typeof cytoscapeDagre !== 'undefined' ? 'dagre' : 'breadthfirst';

  // If the libs didn't load, show a graceful message instead of a blank box.
  if (typeof cytoscape === 'undefined') {
    container.innerHTML =
      '<div style="padding:16px">Graph library failed to load. Please refresh, or try a different network.</div>';
    return;
  }

  /* ------------------------------------------------------------------
     Content model
     - Nodes have:
         id, label, group, kind, tags[], ...
     - Details are shown in the right-hand panel.
  ------------------------------------------------------------------ */

  const DETAILS = {
    root: {
      title: 'My hobby map (embedded / hardware)',
      what:
        'This is a “weekend lab” view of what I like to explore. It’s intentionally close to embedded roles: bring‑up, peripherals, debugging, safety/security thinking, and small repeatable experiments.',
      tools: ['Microcontrollers', 'Datasheets', 'Logic analyzer', 'Oscilloscope', 'C / C++'],
      why: [
        'Shows curiosity + self-driven practice in constrained systems.',
        'Demonstrates the habit of measuring, not guessing.',
        'Connects security thinking to real device constraints.'
      ]
    },

    firmware: {
      title: '🧠 Embedded firmware',
      what:
        'Writing firmware that is readable, testable, and robust — from bare‑metal drivers to RTOS patterns. I like the “small details” (timing, interrupts, power, error handling).',
      tools: ['C', 'C++', 'Bare‑metal', 'RTOS', 'I²C/SPI/UART', 'Timers'],
      why: [
        'Good embedded engineers are data‑sheet driven and disciplined with interfaces.',
        'Peripheral work forces careful thinking about race conditions and timing.'
      ]
    },

    drivers: {
      title: '🧩 Peripheral drivers (register-level)',
      what:
        'I enjoy implementing and refactoring drivers so they’re boring in the best way: predictable APIs, clear state machines, and well-defined error paths.',
      tools: ['GPIO', 'Timers/PWM', 'DMA', 'SPI', 'I²C', 'UART'],
      why: [
        'Directly maps to bring‑up work: sensors, actuators, and board support packages (BSP).',
        'Shows ability to turn an ambiguous datasheet into clean code.'
      ]
    },

    rtos: {
      title: '⏱️ RTOS patterns',
      what:
        'I like experimenting with scheduling, queues, and event-driven designs — especially how design choices change latency and observability.',
      tools: ['FreeRTOS/Zephyr concepts', 'Queues', 'Mutexes', 'Event groups'],
      why: [
        'RTOS work is about tradeoffs: timing, priority inversion, and failure modes.',
        'Shows systems thinking beyond “just write code”.'
      ]
    },

    comms: {
      title: '🔌 Interfaces & buses',
      what:
        'Debugging and integrating real hardware interfaces is oddly satisfying: timing diagrams, pull-ups, bus contention, framing errors… all the fun stuff.',
      tools: ['I²C', 'SPI', 'UART', 'CAN'],
      why: [
        'Most embedded issues show up “on the wire”. Knowing how to observe buses saves days.',
        'Highlights practical integration skills (not only theory).'
      ]
    },

    hw: {
      title: '🛠️ Hardware prototyping',
      what:
        'I enjoy building small circuits, iterating prototypes, and doing the boring-but-necessary checks (power rails, decoupling, pull-ups, signal integrity basics).',
      tools: ['Breadboard', 'Schematics', 'PCB', 'Soldering', 'Bring‑up'],
      why: [
        'Bridges the firmware–hardware gap (a big advantage in embedded teams).',
        'Reduces “hand‑wavy” debugging by verifying the physical layer.'
      ]
    },

    pcb: {
      title: '📐 Schematic → PCB',
      what:
        'I like turning a small idea into a board: symbols/footprints, layout constraints, and sanity checks before ordering.',
      tools: ['KiCad', 'Footprints', 'BOM', 'DRC'],
      why: [
        'Shows understanding of real-world constraints (connectors, routing, power).',
        'Great for hardware development roles or firmware roles that touch board bring‑up.'
      ]
    },

    solder: {
      title: '🔥 Soldering & rework',
      what:
        'Rework is part of prototyping life. I enjoy the careful, practical side: fixing, measuring, and verifying changes step by step.',
      tools: ['Soldering iron', 'Hot air', 'Flux', 'Continuity checks'],
      why: [
        'Demonstrates hands-on comfort in a lab environment.',
        'Pairs well with bring‑up + debug: you can fix what you measure.'
      ]
    },

    debug: {
      title: '🔍 Debugging & measurement',
      what:
        'My default approach: form a hypothesis, measure, isolate, and document. I like tools that make invisible timing and signals visible.',
      tools: ['JTAG/SWD', 'Logic analyzer', 'Oscilloscope', 'Tracing'],
      why: [
        'Shows a mature debugging loop (very valuable in embedded/hardware roles).',
        'Reduces risk: measurement-driven decisions are repeatable.'
      ]
    },

    jtag: {
      title: '🧷 JTAG/SWD + on-target debugging',
      what:
        'Breakpoints, watchpoints, and stepping are nice — but I’m especially interested in “why it broke” (stack traces, registers, memory corruption clues).',
      tools: ['GDB', 'J-Link/ST-Link concepts', 'Watchpoints'],
      why: [
        'Critical for firmware bring‑up and hard-to-reproduce device bugs.',
        'Shows comfort with low-level state (registers, stacks, memory maps).'
      ]
    },

    logic: {
      title: '📈 Logic analyzer traces',
      what:
        'I like capturing bus waveforms and proving timing assumptions. A good trace can explain an entire “mystery bug”.',
      tools: ['SPI/I²C decode', 'Triggering', 'Timing analysis'],
      why: [
        'A practical skill for sensor integration, comms issues, and production debugging.'
      ]
    },

    power: {
      title: '🔋 Power & performance experiments',
      what:
        'I enjoy profiling: where time goes, where energy goes, and what happens under load or corner cases.',
      tools: ['Profiling', 'Power measurement', 'Optimization'],
      why: [
        'Embedded work often equals tight power budgets and hard real-time constraints.'
      ]
    },

    security: {
      title: '🔐 Security × microcontrollers',
      what:
        'Security becomes real on devices: secure boot, keys, debug ports, update mechanisms, and the “what if someone has physical access?” questions.',
      tools: ['Secure boot concepts', 'Crypto basics', 'Threat modeling'],
      why: [
        'Shows security awareness that’s grounded in hardware reality.',
        'Helpful for embedded roles in automotive/IoT/industrial domains.'
      ]
    },

    fwre: {
      title: '🧬 Firmware reverse engineering (for learning)',
      what:
        'I like understanding how firmware is built and how it behaves: file formats, memory maps, and basic analysis to learn design patterns and weaknesses.',
      tools: ['Ghidra/IDA concepts', 'Strings/symbols', 'Control flow'],
      why: [
        'Improves defensive thinking: you write better firmware when you know how it’s analyzed.',
        'Useful for debugging third-party binaries and legacy systems.'
      ]
    },

    harden: {
      title: '🛡️ Hardening mindset',
      what:
        'I’m interested in practical defenses: reducing attack surface, safe defaults, secure updates, and making debug features intentional.',
      tools: ['Secure update concepts', 'Least privilege', 'Key management'],
      why: [
        'Security done well is mostly engineering hygiene + threat modeling.',
        'Maps to industry needs in connected embedded products.'
      ]
    },

    auto: {
      title: '🚗 Automotive mindset (safety + robustness)',
      what:
        'I’m interested in how embedded constraints meet process: traceability, robustness, and designing for failures — the “ISO 26262 style” mindset.',
      tools: ['Fault thinking', 'Diagnostics', 'CAN basics'],
      why: [
        'Automotive work is as much about reliability and process as it is about code.',
        'Demonstrates attention to failure modes and defensive design.'
      ]
    },

    can: {
      title: '🚌 CAN curiosity',
      what:
        'I enjoy learning embedded network basics: message timing, IDs, decoding, and thinking about observability and diagnostics.',
      tools: ['CAN IDs', 'Frames', 'Logging', 'Diagnostics mindset'],
      why: [
        'Relevant for automotive/industrial roles and any distributed embedded system.'
      ]
    },

    iso: {
      title: '🧾 Standards curiosity (ISO 26262 & friends)',
      what:
        'I like reading about how safety-oriented processes shape engineering decisions: requirements, verification mindset, and disciplined change control.',
      tools: ['Traceability', 'Verification mindset', 'Documentation'],
      why: [
        'Shows you can operate in regulated environments and still ship good engineering.'
      ]
    },

    learn: {
      title: '📚 Learn, document, repeat',
      what:
        'My favorite loop: read a datasheet/errata → build a small experiment → write notes so future-me doesn’t repeat mistakes.',
      tools: ['Notes', 'Small labs', 'Repro steps'],
      why: [
        'Documentation discipline is underrated in embedded teams (and saves time).'
      ]
    }
  };

  const nodes = [
    { id: 'root', label: 'Weekend Lab 🔧\n(hobby map)', group: 'hub', kind: 'hub', tags: ['embedded', 'hardware', 'security'] },

    { id: 'firmware', label: '🧠 Embedded\nfirmware', group: 'category', kind: 'category', tags: ['c', 'c++', 'bare-metal', 'rtos'] },
    { id: 'drivers', label: '🧩 Drivers\n(peripherals)', group: 'leaf', kind: 'leaf', tags: ['gpio', 'timers', 'dma', 'spi', 'i2c', 'uart'] },
    { id: 'rtos', label: '⏱️ RTOS\npatterns', group: 'leaf', kind: 'leaf', tags: ['rtos', 'freertos', 'zephyr', 'scheduling'] },
    { id: 'comms', label: '🔌 Interfaces\n& buses', group: 'leaf', kind: 'leaf', tags: ['spi', 'i2c', 'uart', 'can'] },

    { id: 'hw', label: '🛠️ Hardware\nprototyping', group: 'category', kind: 'category', tags: ['pcb', 'soldering', 'bring-up'] },
    { id: 'pcb', label: '📐 Schematic\n→ PCB', group: 'leaf', kind: 'leaf', tags: ['kicad', 'layout', 'bom', 'drc'] },
    { id: 'solder', label: '🔥 Soldering\n& rework', group: 'leaf', kind: 'leaf', tags: ['soldering', 'rework', 'hot air'] },

    { id: 'debug', label: '🔍 Debugging\n& measurement', group: 'category', kind: 'category', tags: ['debug', 'measurement', 'oscilloscope', 'logic analyzer'] },
    { id: 'jtag', label: '🧷 JTAG/SWD\n(debugger)', group: 'leaf', kind: 'leaf', tags: ['jtag', 'swd', 'gdb'] },
    { id: 'logic', label: '📈 Logic\nanalyzer', group: 'leaf', kind: 'leaf', tags: ['logic analyzer', 'spi', 'i2c', 'timing'] },
    { id: 'power', label: '🔋 Power &\nperformance', group: 'leaf', kind: 'leaf', tags: ['profiling', 'power', 'optimization'] },

    { id: 'security', label: '🔐 Security ×\nmicrocontrollers', group: 'security', kind: 'category', tags: ['secure boot', 'crypto', 'threat model'] },
    { id: 'fwre', label: '🧬 Firmware\nRE', group: 'security-leaf', kind: 'leaf', tags: ['ghidra', 'analysis', 'reverse engineering'] },
    { id: 'harden', label: '🛡️ Hardening\nmindset', group: 'security-leaf', kind: 'leaf', tags: ['secure update', 'keys', 'defense'] },

    { id: 'auto', label: '🚗 Automotive\nmindset', group: 'auto', kind: 'category', tags: ['iso 26262', 'can', 'robustness'] },
    { id: 'can', label: '🚌 CAN\ncuriosity', group: 'auto-leaf', kind: 'leaf', tags: ['can', 'frames', 'ids'] },
    { id: 'iso', label: '🧾 ISO 26262\nreading', group: 'auto-leaf', kind: 'leaf', tags: ['iso 26262', 'safety', 'process'] },

    { id: 'learn', label: '📚 Learn\n& write notes', group: 'learn', kind: 'leaf', tags: ['datasheet', 'errata', 'notes'] }
  ];

  const edges = [
    ['root', 'firmware', ''],
    ['firmware', 'drivers', ''],
    ['firmware', 'rtos', ''],
    ['firmware', 'comms', ''],

    ['root', 'hw', ''],
    ['hw', 'pcb', ''],
    ['hw', 'solder', ''],

    ['root', 'debug', ''],
    ['debug', 'jtag', ''],
    ['debug', 'logic', ''],
    ['debug', 'power', ''],

    ['root', 'security', ''],
    ['security', 'fwre', ''],
    ['security', 'harden', ''],

    ['root', 'auto', ''],
    ['auto', 'can', ''],
    ['auto', 'iso', ''],

    ['root', 'learn', '']
  ];

  const mkElements = () => {
    const els = [];
    for (const n of nodes) els.push({ data: n });
    for (const [s, t, l] of edges) els.push({ data: { source: s, target: t, label: l } });
    return els;
  };

  const p = palette();

  const cy = cytoscape({
    container,
    elements: mkElements(),
    wheelSensitivity: 0.12,
    style: [
      {
        selector: 'node',
        style: {
          shape: 'round-rectangle',
          'background-color': p.node,
          'border-color': p.border,
          'border-width': 2,
          'text-wrap': 'wrap',
          'text-max-width': 170,
          label: 'data(label)',
          color: p.text,
          'font-family': 'PT Sans Narrow, sans-serif',
          'font-size': 16,
          'text-valign': 'center',
          'text-halign': 'center',
          padding: '12px',
          width: 'label',
          height: 'label'
        }
      },

      {
        selector: 'node[kind = "hub"]',
        style: {
          shape: 'ellipse',
          'background-color': p.hub,
          'border-color': p.edge2,
          'border-width': 3,
          color: '#ffffff',
          'font-size': 17,
          'text-max-width': 180
        }
      },

      {
        selector: 'node[kind = "category"]',
        style: {
          shape: 'hexagon',
          'border-width': 3,
          'text-max-width': 150
        }
      },

      {
        selector: 'node[group = "category"]',
        style: {
          'border-color': p.cat,
          'background-color': p.node2
        }
      },

      {
        selector: 'node[group = "security"]',
        style: {
          'border-color': p.sec,
          'background-color': p.node2
        }
      },
      {
        selector: 'node[group = "security-leaf"]',
        style: {
          'border-color': p.sec,
          'background-color': p.node
        }
      },

      {
        selector: 'node[group = "auto"]',
        style: {
          'border-color': p.auto,
          'background-color': p.node2
        }
      },
      {
        selector: 'node[group = "auto-leaf"]',
        style: {
          'border-color': p.auto,
          'background-color': p.node
        }
      },

      {
        selector: 'node[group = "learn"]',
        style: {
          'border-color': p.edge2,
          'background-color': p.node
        }
      },

      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': p.edge,
          'target-arrow-shape': 'triangle',
          'target-arrow-color': p.edge,
          'curve-style': 'bezier',
          'arrow-scale': 0.85,
          label: 'data(label)',
          'font-size': 12,
          'text-rotation': 'autorotate',
          'text-background-color': isDark() ? '#0B1220' : '#ffffff',
          'text-background-opacity': 0.95,
          'text-background-padding': 2,
          'text-background-shape': 'round-rectangle',
          color: p.muted
        }
      },

      /* Interaction states */
      {
        selector: 'node.hb-selected',
        style: {
          'border-width': 5,
          'border-color': p.hub,
          'background-color': isDark() ? '#0B172A' : '#E0F2FE'
        }
      },
      {
        selector: '.hb-faded',
        style: {
          opacity: 0.22,
          'text-opacity': 0.25
        }
      },
      {
        selector: 'node.hb-match',
        style: {
          'border-width': 5
        }
      }
    ],
    layout: {
      name: layoutName,
      rankDir: 'LR',
      nodeSep: 50,
      rankSep: 90,
      padding: 16,
      animate: true,
      animationDuration: 450
    }
  });

  // ---------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderTags = (tags) => {
    if (!tags || !tags.length) return '';
    return `<div class="hb-card__tags" style="margin-top:10px">${tags
      .map((t) => `<span class="hb-tag">${escapeHtml(t)}</span>`)
      .join('')}</div>`;
  };

  const renderDetails = (id) => {
    const d = DETAILS[id] || {
      title: 'Details',
      what: 'Select a node to see the explanation.',
      tools: [],
      why: []
    };

    if (titleEl) titleEl.textContent = d.title;
    if (!bodyEl) return;

    const toolsHtml = d.tools?.length
      ? `<div style="margin-top:10px"><div style="font-weight:700; color:${p.text}">Tools / keywords</div>${renderTags(
          d.tools
        )}</div>`
      : '';

    const whyHtml = d.why?.length
      ? `<div style="margin-top:12px"><div style="font-weight:700; color:${p.text}">Why it matters</div><ul class="hb-list">${d.why
          .map((x) => `<li>${escapeHtml(x)}</li>`)
          .join('')}</ul></div>`
      : '';

    bodyEl.innerHTML = `<p>${escapeHtml(d.what)}</p>${toolsHtml}${whyHtml}`;
  };

  const clearFades = () => cy.elements().removeClass('hb-faded');

  const focusNode = (node) => {
    if (!node || node.empty()) return;

    cy.nodes().removeClass('hb-selected');
    node.addClass('hb-selected');

    // Highlight local neighborhood (keeps the map readable)
    cy.elements().addClass('hb-faded');
    node.closedNeighborhood().removeClass('hb-faded');

    // Center/zoom nicely, but don’t be too aggressive on desktop
    const pad = window.matchMedia('(max-width: 640px)').matches ? 80 : 60;
    cy.animate({
      fit: { eles: node.closedNeighborhood(), padding: pad },
      duration: 350
    });

    renderDetails(node.id());
  };

  const resetAll = () => {
    if (searchInput) searchInput.value = '';
    if (searchStatus) searchStatus.textContent = '';
    cy.nodes().removeClass('hb-match hb-selected');
    clearFades();
    cy.fit(undefined, 40);
    renderDetails('root');
  };

  // ---------------------------------------------------------------------
  // Mouse cursor “grab” feel
  // ---------------------------------------------------------------------

  container.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) container.classList.add('hb-grabbing');
  });
  window.addEventListener('mouseup', () => container.classList.remove('hb-grabbing'));

  // ---------------------------------------------------------------------
  // Search / filter
  // ---------------------------------------------------------------------

  const runFilter = (qRaw) => {
    const q = String(qRaw || '').trim().toLowerCase();
    cy.nodes().removeClass('hb-match');

    if (!q) {
      if (searchStatus) searchStatus.textContent = '';
      cy.nodes().removeClass('hb-selected');
      clearFades();
      return;
    }

    const matched = cy.nodes().filter((n) => {
      const label = (n.data('label') || '').toLowerCase();
      const tags = (n.data('tags') || []).join(' ').toLowerCase();
      return label.includes(q) || tags.includes(q);
    });

    cy.elements().addClass('hb-faded');
    matched.removeClass('hb-faded').addClass('hb-match');

    // Also show the parents/neighborhood so matches don’t “float” alone
    matched.forEach((n) => n.neighborhood().removeClass('hb-faded'));

    if (searchStatus) {
      const count = matched.length;
      searchStatus.textContent = count
        ? `${count} node${count === 1 ? '' : 's'} highlighted.`
        : 'No matches.';
    }

    if (matched.length === 1) {
      focusNode(matched[0]);
    } else if (matched.length > 1) {
      cy.fit(matched, 70);
    }
  };

  // ---------------------------------------------------------------------
  // Tooltip (simple, no extra libs)
  // ---------------------------------------------------------------------

  const showTooltip = (node) => {
    if (!tooltipEl) return;
    const label = (node.data('label') || '').replace(/\n/g, ' ');
    tooltipEl.textContent = label;

    const pos = node.renderedPosition();
    // Keep tooltip inside the container as much as possible.
    const margin = 14;
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Start with “above the node”
    let x = pos.x + margin;
    let y = pos.y - margin;

    // Clamp roughly (good enough; avoids expensive layout reads)
    x = Math.max(12, Math.min(x, w - 240));
    y = Math.max(12, Math.min(y, h - 60));

    tooltipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    tooltipEl.setAttribute('aria-hidden', 'false');
  };

  const hideTooltip = () => {
    if (!tooltipEl) return;
    tooltipEl.style.transform = 'translate(-9999px, -9999px)';
    tooltipEl.setAttribute('aria-hidden', 'true');
  };

  // ---------------------------------------------------------------------
  // Wiring events
  // ---------------------------------------------------------------------

  cy.on('tap', 'node', (evt) => focusNode(evt.target));
  cy.on('mouseover', 'node', (evt) => showTooltip(evt.target));
  cy.on('mouseout', 'node', hideTooltip);

  // Clicking background clears selection but keeps current filter.
  cy.on('tap', (evt) => {
    if (evt.target !== cy) return;
    cy.nodes().removeClass('hb-selected');
    // If there is an active filter, keep the fade/highlight state.
    const q = String(searchInput?.value || '').trim();
    if (!q) clearFades();
    renderDetails('root');
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => runFilter(searchInput.value));
  }

  if (btnReset) btnReset.addEventListener('click', resetAll);
  if (btnFit) btnFit.addEventListener('click', () => cy.fit(undefined, 40));

  if (btnPng) {
    btnPng.addEventListener('click', () => {
      const dataUrl = cy.png({ scale: 2, full: true, bg: isDark() ? '#0B1220' : '#ffffff' });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'hobby-map.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  // Re-layout nicely on resize.
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      cy.resize();
      cy.layout({
        name: layoutName,
        rankDir: 'LR',
        nodeSep: 50,
        rankSep: 90,
        padding: 16,
        animate: true,
        animationDuration: 300
      }).run();
    }, 140);
  });

  // Initial state
  cy.ready(() => {
    cy.fit(undefined, 40);
    renderDetails('root');

    // On small screens, gently focus the hub and one layer to reduce clutter.
    if (window.matchMedia('(max-width: 640px)').matches) {
      const hub = cy.$('#root');
      cy.elements().addClass('hb-faded');
      hub.closedNeighborhood().removeClass('hb-faded');
      cy.fit(hub.closedNeighborhood(), 70);
    }
  });
})();

