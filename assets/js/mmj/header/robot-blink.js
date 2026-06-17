/* assets/js/mmj/header/robot-blink.js */

(function (window) {
  "use strict";

  const MMJ = window.MMJ = window.MMJ || {};
  const header = MMJ.header = MMJ.header || {};

  function startRandomBlink(state, cpuFace, prefersReducedMotion) {
    stopRandomBlink(state);
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

  function stopRandomBlink(state) {
    if (state.blinkTimer) window.clearTimeout(state.blinkTimer);
    state.blinkTimer = 0;
  }

  header.robotBlink = {
    startRandomBlink,
    stopRandomBlink
  };
})(window);
