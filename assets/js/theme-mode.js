(function () {
  "use strict";

  var STORAGE_KEY = "mmj-theme-mode";
  var NIGHT = "night";
  var LIGHT = "light";
  var VALID_MODES = [LIGHT, NIGHT];
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function isValidMode(mode) {
    return VALID_MODES.indexOf(mode) !== -1;
  }

  function getStoredMode() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return isValidMode(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function setStoredMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      // Storage may be unavailable in private contexts; the DOM state still updates.
    }
  }

  function getSystemMode() {
    return media && media.matches ? NIGHT : LIGHT;
  }

  function getResolvedMode() {
    return getStoredMode() || getSystemMode();
  }

  function setThemeColor(mode) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute("content", mode === NIGHT ? "#071510" : "#ffffff");
  }

  function updateButton(button, mode, source) {
    if (!button) return;
    var nextMode = mode === NIGHT ? LIGHT : NIGHT;
    var label = "Theme mode is " + mode + ". Switch to " + (nextMode === NIGHT ? "dark" : "light") + " mode.";

    button.setAttribute("data-theme-mode", mode);
    button.setAttribute("data-theme-active", mode);
    button.setAttribute("data-theme-source", source);
    button.setAttribute("aria-pressed", mode === NIGHT ? "true" : "false");
    button.setAttribute("aria-label", label);
    button.classList.toggle("is-theme-night", mode === NIGHT);
    button.classList.toggle("is-theme-light", mode === LIGHT);
  }

  function applyTheme(mode, source) {
    root.setAttribute("data-theme-mode", mode);
    root.setAttribute("data-theme", mode);
    root.setAttribute("data-theme-source", source);
    root.style.colorScheme = mode === NIGHT ? "dark" : "light";
    setThemeColor(mode);
    updateButton(document.querySelector("[data-theme-toggle]"), mode, source);
  }

  function syncFromStorage() {
    var stored = getStoredMode();
    applyTheme(stored || getSystemMode(), stored ? "stored" : "system");
  }

  function toggleTheme() {
    var nextMode = getResolvedMode() === NIGHT ? LIGHT : NIGHT;
    setStoredMode(nextMode);
    applyTheme(nextMode, "stored");
  }

  function bindThemeToggle() {
    var button = document.querySelector("[data-theme-toggle]");
    if (!button) return;

    button.addEventListener("click", toggleTheme);
    syncFromStorage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindThemeToggle);
  } else {
    bindThemeToggle();
  }

  if (media) {
    var handleSystemChange = function () {
      if (!getStoredMode()) syncFromStorage();
    };

    if (media.addEventListener) {
      media.addEventListener("change", handleSystemChange);
    } else if (media.addListener) {
      media.addListener(handleSystemChange);
    }
  }
})();
