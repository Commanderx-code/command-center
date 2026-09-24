// Shared markup helpers for feature views. Callers escape dynamic text.
export const button = (text, attrs = "", primary = false) =>
  `<button type="button" class="${primary ? "primary" : "secondary"}-button" ${attrs}>${text}</button>`;
export const head = (eyebrow, title, copy, actions = "") =>
  `<div class="module-heading"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>${copy}</p></div><div class="button-row">${actions}</div></div>`;
export const empty = (text) => `<p class="module-empty">${text}</p>`;
