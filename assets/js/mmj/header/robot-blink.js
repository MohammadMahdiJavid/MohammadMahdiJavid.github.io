/* assets/js/mmj/header/robot-blink.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};
  const BLINK_CLASS = "is-blinking";
  const BLINK_SPEED_PROPERTY = "--pcb-robot-blink-speed";
  const DEFAULT_BLINK_SPEED = 2;
  const DEFAULT_BLINK_DURATION = 820;

  function toNumber(value, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getBlinkSpeed(robot) {
    const cssSpeed = robot && window.getComputedStyle ?
      window.getComputedStyle(robot).getPropertyValue(BLINK_SPEED_PROPERTY) :
      "";
    const speed = toNumber(
      robot && robot.dataset ? robot.dataset.blinkSpeed : "",
      toNumber(cssSpeed, DEFAULT_BLINK_SPEED)
    );

    return Math.max(speed, 0.1);
  }

  function scaledBlinkTime(robot, value, fallback, minimum) {
    const base = toNumber(value, fallback);
    const scaled = Math.round(base / getBlinkSpeed(robot));
    return Math.max(minimum, scaled);
  }

  function randomBetween(min, max) {
    return Math.floor(min + Math.random() * (max - min));
  }

  function isReducedMotion(prefersReducedMotion) {
    return !!prefersReducedMotion ||
      !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function blinkRobot(state, robot, prefersReducedMotion) {
    if (!robot || isReducedMotion(prefersReducedMotion) || robot.classList.contains(BLINK_CLASS)) {
      return false;
    }

    if (state.blinkResetTimer) {
      window.clearTimeout(state.blinkResetTimer);
      state.blinkResetTimer = 0;
    }

    robot.classList.add(BLINK_CLASS);

    state.blinkResetTimer = window.setTimeout(() => {
      robot.classList.remove(BLINK_CLASS);
      state.blinkResetTimer = 0;
    }, scaledBlinkTime(robot, robot.dataset && robot.dataset.blinkDuration, DEFAULT_BLINK_DURATION, 120));

    return true;
  }

  function startRandomBlink(state, cpuFace, prefersReducedMotion) {
    stopRandomBlink(state);
    if (!cpuFace || isReducedMotion(prefersReducedMotion)) return;

    const loop = () => {
      if (!state.inView) {
        state.blinkTimer = window.setTimeout(loop, 1200);
        return;
      }

      const min = scaledBlinkTime(cpuFace, cpuFace.dataset && cpuFace.dataset.blinkMin, 4200, 250);
      const max = Math.max(
        scaledBlinkTime(cpuFace, cpuFace.dataset && cpuFace.dataset.blinkMax, 9200, min + 125),
        min + 125
      );
      const wait = randomBetween(min, max);
      state.blinkTimer = window.setTimeout(() => {
        blinkRobot(state, cpuFace, prefersReducedMotion);
        loop();
      }, wait);
    };

    loop();
  }

  function stopRandomBlink(state) {
    if (state.blinkTimer) window.clearTimeout(state.blinkTimer);
    if (state.blinkResetTimer) window.clearTimeout(state.blinkResetTimer);
    state.blinkTimer = 0;
    state.blinkResetTimer = 0;
  }

  header.robotBlink = {
    blinkRobot,
    startRandomBlink,
    stopRandomBlink
  };
})(window);
