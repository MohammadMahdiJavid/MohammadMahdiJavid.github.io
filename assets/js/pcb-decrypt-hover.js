/* assets/js/pcb-decrypt-hover.js */

(() => {
  "use strict";

  const ROOT_SELECTOR = "[data-pcb-decrypt]";
  const TEXT_SELECTOR = "[data-pcb-decrypt-text]";
  const GLYPHS = Array.from("01/_{}<>[]#.+*~");
  const MIN_FRAME_COUNT = 7;
  const FRAME_MS = 28;

  const boundRoots = new WeakSet();
  const timers = new WeakMap();
  const reducedMotionQuery =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  function prefersReducedMotion() {
    return !!(reducedMotionQuery && reducedMotionQuery.matches);
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function randomGlyph() {
    return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }

  function visibleLabelFor(root, textEl) {
    return normalizeText(root.dataset.pcbDecryptLabel || textEl.textContent);
  }

  function altFor(root, label) {
    return normalizeText(root.dataset.pcbDecryptAlt || label);
  }

  function maxVisualWidth(label, alt) {
    const maxChars = Math.max(Array.from(label).length, Array.from(alt).length);
    return `${Math.max(maxChars, 1)}ch`;
  }

  function resolveTrigger(root) {
    return root.closest("a, button") || root;
  }

  function isHiddenOverflowMenu(root) {
    return !!(root && root.closest(".hidden-links"));
  }

  function makeFrame(target, reveal) {
    return Array.from(target)
      .map((char, index) => {
        if (/\s/.test(char)) return char;
        if (index < reveal) return char;
        return randomGlyph();
      })
      .join("");
  }

  function clearTimer(root) {
    const timer = timers.get(root);
    if (timer) {
      window.clearInterval(timer);
      timers.delete(root);
    }
  }

  function setBusy(root, busy) {
    root.classList.toggle("is-decrypting", busy);
  }

  function setText(root, textEl, value) {
    clearTimer(root);
    textEl.textContent = value;
    setBusy(root, false);
  }

  function scramble(root, textEl, target) {
    clearTimer(root);

    if (!target) return;

    if (prefersReducedMotion()) {
      setText(root, textEl, target);
      return;
    }

    const targetChars = Array.from(target);
    const maxFrames = Math.max(MIN_FRAME_COUNT, targetChars.length + 3);
    let frame = 0;

    setBusy(root, true);

    const timer = window.setInterval(() => {
      const reveal = Math.max(0, frame - 2);
      textEl.textContent = makeFrame(target, reveal);
      frame += 1;

      if (frame > maxFrames) {
        setText(root, textEl, target);
      }
    }, FRAME_MS);

    timers.set(root, timer);
  }

  function enhance(root) {
    if (!root || boundRoots.has(root)) return;

    const textEl = root.querySelector(TEXT_SELECTOR);
    if (!textEl) return;

    const label = visibleLabelFor(root, textEl);
    const alt = altFor(root, label);
    const trigger = resolveTrigger(root);

    if (!label || !trigger) return;

    root.dataset.pcbDecryptLabel = label;
    root.dataset.pcbDecryptAlt = alt;
    root.style.setProperty("--pcb-decrypt-width", maxVisualWidth(label, alt));
    boundRoots.add(root);

    if ((trigger.tagName === "A" || trigger.tagName === "BUTTON") && !trigger.hasAttribute("aria-label")) {
      trigger.setAttribute("aria-label", label);
    }

    trigger.classList.add("pcb-decrypt-link");

    const activate = () => {
      if (isHiddenOverflowMenu(root)) {
        setText(root, textEl, label);
        return;
      }

      scramble(root, textEl, alt);
    };

    const deactivate = () => setText(root, textEl, label);

    trigger.addEventListener("mouseenter", activate, { passive: true });
    trigger.addEventListener("mouseleave", deactivate, { passive: true });
    trigger.addEventListener("focus", activate, { passive: true });
    trigger.addEventListener("blur", deactivate, { passive: true });
  }

  function enhanceAll(scope = document) {
    const roots = scope.matches && scope.matches(ROOT_SELECTOR)
      ? [scope]
      : Array.from(scope.querySelectorAll ? scope.querySelectorAll(ROOT_SELECTOR) : []);

    roots.forEach(enhance);
  }

  function resetAll() {
    document.querySelectorAll(ROOT_SELECTOR).forEach((root) => {
      const textEl = root.querySelector(TEXT_SELECTOR);
      if (textEl) setText(root, textEl, root.dataset.pcbDecryptLabel || textEl.textContent);
    });
  }

  function watchForNewNodes() {
    if (typeof MutationObserver !== "function") return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) enhanceAll(node);
        });
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    enhanceAll(document);
    watchForNewNodes();

    if (reducedMotionQuery && typeof reducedMotionQuery.addEventListener === "function") {
      reducedMotionQuery.addEventListener("change", resetAll);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
