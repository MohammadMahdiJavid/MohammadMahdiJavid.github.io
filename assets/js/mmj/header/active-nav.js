/* assets/js/mmj/header/active-nav.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

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

  function displayedId(state) {
    return state.hoverId || state.activeId;
  }

  function applyActiveVisuals(state) {
    const id = displayedId(state);

    for (const [key, el] of state.ioMap.entries()) {
      if (!el) continue;
      el.classList.toggle("is-active", key === id);
    }

    for (const [key, meta] of state.nets.entries()) {
      meta.g.classList.toggle("is-active", key === id);
    }

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

  header.activeNav = {
    normalizePath,
    currentPath,
    pickActiveFromLocation,
    displayedId,
    applyActiveVisuals
  };
})(window);
