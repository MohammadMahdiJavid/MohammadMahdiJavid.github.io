
(function () {
  'use strict';

  const root = document.getElementById('hobby-quest');
  if (!root) return; // Only run on the hobbies page

  const $ = (id) => document.getElementById(id);

  const card = $('hq-card');
  const titleEl = $('hq-title');
  const bodyEl = $('hq-body');
  const optionsEl = $('hq-options');
  const crumbsEl = $('hq-crumbs');
  const badgeEl = $('hq-badge');
  const hintEl = $('hq-hint');

  const backBtn = $('hq-back');
  const shuffleBtn = $('hq-shuffle');
  const resetBtn = $('hq-reset');

  const bg = $('hq-bg');
  const ctx = bg.getContext('2d');

  const mediaTouch = matchMedia('(pointer: coarse)');
  const mediaReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const isTouch = () => mediaTouch.matches;
  const reducedMotion = () => mediaReducedMotion.matches;

  // --- Data ---------------------------------------------------------------
  // A small decision-tree similar to your original flowchart, but designed
  // for a “conversation starter” vibe.
  const NODES = {
    A: {
      badge: '🟦 start',
      title: 'Feeling bored?',
      body: [
        'No worries — let’s turn that into something fun.',
        'Pick a vibe (or hit 🎲 surprise me).'
      ],
      options: [
        { label: 'Yep 😅 Let’s fix it', to: 'B' },
        { label: 'Just exploring 👀', to: 'B' }
      ]
    },

    B: {
      badge: '🔶 choose',
      title: 'Pick an activity',
      body: [
        'This is basically a tiny “choose-your-own-hobby adventure”.',
        'What sounds good right now?'
      ],
      options: [
        { label: '🎬 Movies / Series', to: 'C' },
        { label: '🍜 Food outing', to: 'D' },
        { label: '🚶 Talk & Walk', to: 'W' },
        { label: '🧩 Puzzle / DIY', to: 'F' },
        { label: '🧠 Deep talks', to: 'G' },
        { label: '🌍 Language / Culture', to: 'H' },
        { label: '💡 Challenge yourself', to: 'K' },
        { label: '😢 Need to vent?', to: 'I' },
        { label: '🎮 Games', to: 'GM' }
      ]
    },

    // --- Entertainment ----------------------------------------------------
    C: {
      badge: '🎬 chill',
      title: '🎬 Movie / series time',
      body: [
        'Perfect “low-energy, high-comfort” choice.',
        { heading: 'Conversation starters', items: [
          'What genre never disappoints you?',
          'Are you a “one episode” person or a binge mode legend?',
          'Best plot twist you’ve seen recently?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    D: {
      badge: '🍜 yummy',
      title: '🍜 Grab a bite somewhere tasty',
      body: [
        'Food is an instant mood upgrade. Also: great for talking.',
        { heading: 'Conversation starters', items: [
          'Team spicy or team mild?',
          'Top 3 cuisines?',
          'The best “hidden gem” restaurant you know?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    // --- Walk -------------------------------------------------------------
    W: {
      badge: '🔶 quick check',
      title: '🚶 Walk & talk',
      body: [
        'Walks are underrated: brain refresh + good conversations.',
        'Quick weather check:'
      ],
      options: [
        { label: '🌤️ Nice weather', to: 'E' },
        { label: '☀️ Super hot (> 30°C)', to: 'E2' }
      ]
    },

    E: {
      badge: '🌳 outdoors',
      title: '🌳 Stroll by the river',
      body: [
        'Bonus points if there’s coffee or ice cream involved.',
        { heading: 'Conversation starters', items: [
          'Are you more of a “deep talk while walking” person or a “silence is comfy” person?',
          'Best city/park you’ve walked in?',
          'What’s your ideal weekend pace?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    E2: {
      badge: '🥵 hot day',
      title: '☀️ Hot-day walk (shade mode)',
      body: [
        'Rule #1: don’t get cooked by the sun 😄',
        'Plan: shady streets → cold drink → short walk → victory.',
        { heading: 'Conversation starters', items: [
          'Iced coffee or cold tea?',
          'What’s your “too hot to function” temperature?',
          'Best summer snack?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    // --- DIY / productivity ----------------------------------------------
    F: {
      badge: '🧩 build',
      title: '🧩 Puzzle / DIY / side project',
      body: [
        'The satisfying kind of fun: you end with something done.',
        { heading: 'Conversation starters', items: [
          'Are you a “plan first” builder or a “start & improvise” builder?',
          'What’s a project you’re proud of (even if it’s small)?',
          'If you had a free weekend, what would you build?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    // --- Deep talks -------------------------------------------------------
    G: {
      badge: '🧠 talk',
      title: '📊 Deep talks (science / investing / politics)',
      body: [
        'Aka: “let’s accidentally talk for 3 hours”.',
        { heading: 'Conversation starters', items: [
          'Which topic do you *never* get bored of?',
          'What’s a belief you changed your mind about recently?',
          'If you could learn one topic deeply, what would it be?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    // --- Language / culture ----------------------------------------------
    H: {
      badge: '🌍 learn',
      title: '🗣️ Language / culture quirks',
      body: [
        'The fun part is discovering the weird little details.',
        { heading: 'Conversation starters', items: [
          'What language would you learn if it was instant?',
          'Favorite idiom / expression?',
          'What’s the most “culture shock” moment you’ve had?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    // --- Vent loop --------------------------------------------------------
    I: {
      badge: '🔶 check',
      title: '😢 Expectations check',
      body: [
        'Sometimes you just want to unload — totally valid.',
        'What do you want right now?'
      ],
      options: [
        { label: 'Sure — just listen 🙂', to: 'J' },
        { label: 'Skip — back to choices', to: 'B' }
      ]
    },

    J: {
      badge: '🙂 support',
      title: '🙂 I’ll listen (no fixing unless asked)',
      body: [
        'Deal: I’ll listen, ask a few clarifying questions, and keep it gentle.',
        { heading: 'If you want prompts', items: [
          '“Do you want advice or just space to vent?”',
          '“What part is the most annoying about it?”',
          '“What would make today feel 10% better?”' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ]
    },

    // --- Challenge --------------------------------------------------------
    K: {
      badge: '🚀 level up',
      title: '🚀 Learn something brand‑new together',
      body: [
        'Tiny challenges are the best kind of motivation.',
        { heading: 'Conversation starters', items: [
          'If we had 30 minutes, what could we learn right now?',
          'Are you more “consistent daily” or “intense sprint”?',
          'What’s a skill you secretly want?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    // --- Games ------------------------------------------------------------
    GM: {
      badge: '🎮 queue',
      title: '🎮 Games',
      body: [
        'Okay… ranked or chill? 😄',
        'Pick one:'
      ],
      options: [
        { label: '🛡️ Dota 2', to: 'DOTA' },
        { label: '🔫 CS:GO', to: 'CSGO' },
        { label: '🎉 Something casual / co‑op', to: 'COOP' }
      ]
    },

    DOTA: {
      badge: '🛡️ dota',
      title: '🛡️ Dota 2 time',
      body: [
        'Mood: “one more game” (famous last words).',
        { heading: 'Conversation starters', items: [
          'What role do you enjoy the most?',
          'Favorite hero (and why)?',
          'Best/worst patch change you remember?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to games', to: 'GM', replaceHistory: true },
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    CSGO: {
      badge: '🔫 aim',
      title: '🔫 CS:GO time',
      body: [
        'Warm‑up idea: 5 minutes → “okay I’m ready” → instantly whiff 😄',
        { heading: 'Conversation starters', items: [
          'Favorite map?',
          'Rifles or AWP?',
          'Do you like tactical play or pure chaos?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to games', to: 'GM', replaceHistory: true },
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    },

    COOP: {
      badge: '🎉 chill',
      title: '🎉 Casual / co‑op vibes',
      body: [
        'Sometimes the goal is just laughs and good energy.',
        { heading: 'Conversation starters', items: [
          'Do you prefer co‑op or party games?',
          'What game can you replay forever?',
          'Top “late night with friends” game?' 
        ]}
      ],
      options: [
        { label: '↩️ Back to games', to: 'GM', replaceHistory: true },
        { label: '↩️ Back to menu', to: 'B', replaceHistory: true }
      ],
      celebrate: true
    }
  };

  // --- State --------------------------------------------------------------
  let currentId = 'A';
  /** @type {string[]} */
  let history = [];

  // --- Helpers ------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function setBadge(text) {
    badgeEl.textContent = text || '✨';
  }

  function renderBody(body) {
    // Body can contain strings or {heading, items[]} blocks
    const parts = [];
    for (const chunk of body || []) {
      if (typeof chunk === 'string') {
        parts.push(`<p>${escapeHtml(chunk)}</p>`);
      } else if (chunk && typeof chunk === 'object' && Array.isArray(chunk.items)) {
        const heading = chunk.heading ? `<strong>${escapeHtml(chunk.heading)}:</strong>` : '';
        const items = chunk.items
          .map((x) => `<li>${escapeHtml(String(x))}</li>`)
          .join('');
        parts.push(`<p>${heading}</p><ul>${items}</ul>`);
      }
    }
    bodyEl.innerHTML = parts.join('');
  }

  function renderOptions(options) {
    optionsEl.innerHTML = '';
    const opts = Array.isArray(options) ? options : [];

    opts.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hq-option';
      btn.dataset.to = opt.to;
      btn.dataset.replaceHistory = opt.replaceHistory ? '1' : '0';
      btn.innerHTML = `
        <span class="hq-option__key">${idx + 1}</span>
        <span class="hq-option__label">${escapeHtml(opt.label)}</span>
      `;
      btn.addEventListener('click', () => {
        navigate(opt.to, { replaceHistory: !!opt.replaceHistory });
      });
      optionsEl.appendChild(btn);
    });

    // If we have fewer than 2 options, keep layout tidy on desktop.
    if (opts.length <= 2) {
      optionsEl.style.gridTemplateColumns = isTouch() ? '1fr' : '1fr 1fr';
    } else {
      optionsEl.style.gridTemplateColumns = '';
    }
  }

  function updateCrumbs() {
    // Show a tiny breadcrumb of the last 2 steps (kept minimal to avoid clutter)
    const path = [...history, currentId]
      .map((id) => (NODES[id] ? NODES[id].title : id))
      .filter(Boolean);

    const tail = path.slice(-3);
    crumbsEl.textContent = tail.join('  →  ');
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // --- Transitions --------------------------------------------------------
  async function animateCardSwap(renderFn) {
    if (reducedMotion()) {
      renderFn();
      return;
    }

    const out = card.animate(
      [
        { opacity: 1, transform: 'translateY(0px) scale(1)' },
        { opacity: 0, transform: 'translateY(10px) scale(0.99)' }
      ],
      { duration: 140, easing: 'ease-out', fill: 'forwards' }
    );

    try { await out.finished; } catch (_) {}
    renderFn();

    const inn = card.animate(
      [
        { opacity: 0, transform: 'translateY(-8px) scale(0.99)' },
        { opacity: 1, transform: 'translateY(0px) scale(1)' }
      ],
      { duration: 170, easing: 'ease-out', fill: 'forwards' }
    );
    try { await inn.finished; } catch (_) {}
  }

  // --- Navigation ---------------------------------------------------------
  function renderNode(id) {
    const node = NODES[id];
    if (!node) return;

    setBadge(node.badge);
    titleEl.textContent = node.title;
    renderBody(node.body);
    renderOptions(node.options);
    updateCrumbs();

    backBtn.disabled = history.length === 0;

    if (node.celebrate) burst();
  }

  function navigate(to, { replaceHistory = false } = {}) {
    if (!NODES[to]) return;
    const from = currentId;

    if (replaceHistory) {
      // Replace current node without stacking up history (useful for “back to menu”)
      currentId = to;
      animateCardSwap(() => renderNode(currentId));
      return;
    }

    history.push(from);
    currentId = to;
    animateCardSwap(() => renderNode(currentId));
  }

  function goBack() {
    if (history.length === 0) return;
    currentId = history.pop();
    animateCardSwap(() => renderNode(currentId));
  }

  function reset() {
    history = [];
    currentId = 'A';
    animateCardSwap(() => renderNode(currentId));
  }

  function shuffle() {
    const node = NODES[currentId];
    if (!node || !Array.isArray(node.options) || node.options.length === 0) {
      // Fallback: jump to menu
      navigate('B');
      return;
    }
    const opt = pick(node.options);
    navigate(opt.to, { replaceHistory: !!opt.replaceHistory });
  }

  // --- Keyboard controls --------------------------------------------------
  // 1–9 = pick option; Esc = back; R = restart; Space = shuffle
  function onKeyDown(ev) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;

    const k = ev.key;
    if (k >= '1' && k <= '9') {
      const idx = Number(k) - 1;
      const node = NODES[currentId];
      const opt = node && node.options ? node.options[idx] : null;
      if (opt) {
        ev.preventDefault();
        navigate(opt.to, { replaceHistory: !!opt.replaceHistory });
      }
      return;
    }

    if (k === 'Escape') {
      ev.preventDefault();
      goBack();
      return;
    }

    if (k === 'r' || k === 'R') {
      ev.preventDefault();
      reset();
      return;
    }

    if (k === ' ') {
      ev.preventDefault();
      shuffle();
    }
  }

  // --- Cute tilt interaction ---------------------------------------------
  function setupTilt() {
    if (isTouch() || reducedMotion()) return;

    const maxDeg = 6;
    const maxZ = 10;

    card.addEventListener('pointermove', (ev) => {
      const r = card.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width;
      const py = (ev.clientY - r.top) / r.height;

      const ry = clamp((px - 0.5) * (maxDeg * 2), -maxDeg, maxDeg);
      const rx = clamp((0.5 - py) * (maxDeg * 2), -maxDeg, maxDeg);
      const tz = maxZ;

      card.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      card.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      card.style.setProperty('--tz', tz + 'px');
    });

    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--tz', '0px');
    });
  }

  // --- Background: floating emojis + burst particles ---------------------
  const floatEmoji = ['🎬', '🍜', '🌳', '🚶', '🧩', '📊', '🗣️', '🚀', '🎮', '✨', '☕', '🎧', '📚'];
  const floaters = [];
  const confetti = [];

  let w = 0;
  let h = 0;
  let dpr = 1;

  function resizeCanvas() {
    const rect = root.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    bg.width = Math.floor(w * dpr);
    bg.height = Math.floor(h * dpr);
    bg.style.width = w + 'px';
    bg.style.height = h + 'px';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedFloaters(count) {
    floaters.length = 0;
    const n = Math.max(10, Math.min(28, count));
    for (let i = 0; i < n; i++) {
      floaters.push({
        emoji: pick(floatEmoji),
        x: rand(0, w),
        y: rand(0, h),
        s: rand(14, 28),
        vy: rand(10, 26) / 60,
        vx: rand(-8, 8) / 60,
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.6, 0.6) / 60,
        a: rand(0.10, 0.22)
      });
    }
  }

  function burst() {
    if (reducedMotion()) return;

    const r = card.getBoundingClientRect();
    const originX = (r.left + r.width / 2) - root.getBoundingClientRect().left;
    const originY = (r.top + Math.min(90, r.height / 2)) - root.getBoundingClientRect().top;

    const colors = [
      'rgba(56,189,248,0.9)',
      'rgba(251,191,36,0.9)',
      'rgba(192,132,252,0.9)',
      'rgba(34,197,94,0.85)',
      'rgba(244,63,94,0.85)'
    ];

    const count = 26;
    for (let i = 0; i < count; i++) {
      const ang = rand(-Math.PI, Math.PI);
      const spd = rand(1.2, 3.8);
      confetti.push({
        x: originX,
        y: originY,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.2,
        g: rand(0.03, 0.06),
        s: rand(2.0, 4.0),
        r: rand(0, Math.PI * 2),
        vr: rand(-0.25, 0.25),
        life: rand(36, 58),
        color: pick(colors)
      });
    }
  }

  function draw(ts) {
    // Clear
    ctx.clearRect(0, 0, w, h);

    // Floating emojis
    for (const f of floaters) {
      f.x += f.vx;
      f.y += f.vy;
      f.rot += f.vr;

      if (f.y > h + 40) f.y = -40;
      if (f.x < -40) f.x = w + 40;
      if (f.x > w + 40) f.x = -40;

      ctx.save();
      ctx.globalAlpha = f.a;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.font = `${f.s}px system-ui, Apple Color Emoji, Segoe UI Emoji`;
      ctx.fillText(f.emoji, -f.s / 2, f.s / 2);
      ctx.restore();
    }

    // Confetti particles
    for (let i = confetti.length - 1; i >= 0; i--) {
      const p = confetti[i];
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.life -= 1;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 60));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s);
      ctx.restore();

      if (p.life <= 0 || p.y > h + 40) confetti.splice(i, 1);
    }

    requestAnimationFrame(draw);
  }

  // --- Wiring -------------------------------------------------------------
  backBtn.addEventListener('click', goBack);
  shuffleBtn.addEventListener('click', shuffle);
  resetBtn.addEventListener('click', reset);

  window.addEventListener('keydown', onKeyDown, { passive: false });

  // Make the hint adapt to input
  function updateHint() {
    if (isTouch()) {
      hintEl.textContent = 'Tip: tap an option · use 🎲 for a random pick ✨';
    } else {
      hintEl.textContent = 'Tip: click an option · press 1–9 · Space = 🎲 · Esc = back ✨';
    }
  }
  updateHint();
  mediaTouch.addEventListener('change', updateHint);

  // Background init
  resizeCanvas();
  seedFloaters(isTouch() ? 12 : 18);
  requestAnimationFrame(draw);

  // Keep things responsive
  window.addEventListener('resize', () => {
    resizeCanvas();
    seedFloaters(isTouch() ? 12 : 18);
  });

  // Start
  renderNode(currentId);
  setupTilt();
})();

