/* assets/js/mmj/header/capacitor-art.js */

(function (window) {
  "use strict";

  const CAPACITOR_SVG_CONTENT = `
<g transform="translate(-0.3 0.45) scale(0.096 0.071)">
  <path
    class="pcb-c__lead-metal"
    d="M82 244H106V297C106 304.2 100.2 310 93 310C86.9 310 82 305.1 82 299V244Z"
    fill="currentColor"
  />
  <path
    class="pcb-c__lead-metal"
    d="M150 244H174V299C174 305.1 169.1 310 163 310C155.8 310 150 304.2 150 297V244Z"
    fill="currentColor"
  />

  <path
    class="pcb-c__side-wall"
    d="M49 70V218"
    stroke="currentColor"
    stroke-width="8"
    stroke-linecap="round"
  />
  <path
    class="pcb-c__side-wall"
    d="M207 70V218"
    stroke="currentColor"
    stroke-width="8"
    stroke-linecap="round"
  />

  <path
    class="pcb-c__polarity-mark"
    d="M69 130V158"
    stroke="currentColor"
    stroke-width="6"
    stroke-linecap="round"
  />
  <path
    class="pcb-c__polarity-mark"
    d="M187 184V207"
    stroke="currentColor"
    stroke-width="6"
    stroke-linecap="round"
  />

  <path
    class="pcb-c__sleeve"
    fill="currentColor"
    fill-rule="evenodd"
    d="
      M103 96
      C111 99 119 101 128 101
      C137 101 145 99 153 96
      V240
      C146 243.5 137.5 245.5 128 245.5
      C118.5 245.5 110 243.5 103 240
      V96Z

      M128 133
      C122.8 133 118.5 137.3 118.5 142.5
      V164.5
      C118.5 169.7 122.8 174 128 174
      C133.2 174 137.5 169.7 137.5 164.5
      V142.5
      C137.5 137.3 133.2 133 128 133Z

      M128 193
      C122.8 193 118.5 197.3 118.5 202.5
      V226
      C118.5 231.2 122.8 235.5 128 235.5
      C133.2 235.5 137.5 231.2 137.5 226
      V202.5
      C137.5 197.3 133.2 193 128 193Z
    "
  />

  <path
    class="pcb-c__lower-roll"
    d="M49 218C71 237 98 247 128 247C158 247 185 237 207 218V236C185 253 158 262 128 262C98 262 71 253 49 236V218Z"
    fill="currentColor"
  />

  <ellipse
    class="pcb-c__top-rim"
    cx="128"
    cy="69"
    rx="80"
    ry="34"
    stroke="currentColor"
    stroke-width="8"
  />
  <path
    class="pcb-c__front-lip"
    d="M49 70C55 97 91 111 128 111C165 111 201 97 207 70"
    stroke="currentColor"
    stroke-width="8"
    stroke-linecap="round"
  />

  <path
    class="pcb-c__top-surface"
    fill="currentColor"
    fill-rule="evenodd"
    d="
      M69 69
      C69 55.19 95.42 44 128 44
      C160.58 44 187 55.19 187 69
      C187 82.81 160.58 94 128 94
      C95.42 94 69 82.81 69 69Z

      M176.21 91.08
      L137.15 69
      L176.21 46.92
      L171.79 39.08
      L128 63.83
      L84.21 39.08
      L79.79 46.92
      L118.85 69
      L79.79 91.08
      L84.21 98.92
      L128 74.17
      L171.79 98.92
      Z
    "
  />
</g>
`;

  window.MMJ = window.MMJ || {};
  window.MMJ.header = window.MMJ.header || {};
  window.MMJ.header.capacitorArt = { svgContent: CAPACITOR_SVG_CONTENT };
  window.MMJ.header.capacitorArtSvg = CAPACITOR_SVG_CONTENT;
  window.PCB_CAPACITOR_SVG_CONTENT = CAPACITOR_SVG_CONTENT;
})(window);
