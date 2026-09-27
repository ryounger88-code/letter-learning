// Kid-mode building blocks: elements, icons, cards, and one-shot visual reactions.
//
// K13: reactions are classes removed by timers, never by 'animationend'. When reduced motion
// is on, the shared theme turns animations off, so an animationend listener would never fire.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

// K6: the only drawn icons in kid mode. Inline SVG so they look the same on every device.
const svg = (inner, vb = '0 0 48 48') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;
export const ICONS = {
  house: svg('<path d="M8 22 L24 8 L40 22" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 20 V39 a2 2 0 0 0 2 2 H33 a2 2 0 0 0 2 -2 V20" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/><rect x="20" y="28" width="8" height="13" rx="2" fill="currentColor"/>'),
  arrow: svg('<path d="M8 24 H38 M26 12 L38 24 L26 36" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
  again: svg('<path d="M38 24 a14 14 0 1 1 -4.1 -9.9" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/><path d="M36 6 V16 H26" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>'),
  check: svg('<path d="M10 25 L20 35 L39 14" fill="none" stroke="currentColor" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>'),
  star: svg('<path d="M24 4 L29.6 17.2 L44 18.4 L33 27.8 L36.4 42 L24 34.4 L11.6 42 L15 27.8 L4 18.4 L18.4 17.2 Z" fill="currentColor" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>'),
};

export const RIDGE_SVG = `<svg class="ridge" viewBox="0 0 1200 90" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="r1" d="M0 70 L140 48 L260 62 L420 30 L520 44 L640 18 L700 28 L760 22 L900 50 L1040 36 L1200 58 L1200 90 L0 90Z"/><path class="r2" d="M0 80 L180 62 L330 74 L500 52 L680 70 L860 56 L1020 72 L1200 64 L1200 90 L0 90Z"/><path class="r3" d="M0 90 L0 86 L240 80 L520 88 L800 78 L1080 86 L1200 82 L1200 90Z"/></svg>`;

/** A kid letter card: colour fill, "Ll" in Andika, the anchor picture on a white disc. */
export function kidCard(content, id, { size = '' } = {}) {
  const k = content.kid(id);
  const anchor = content.anchor(id);
  const card = h('button', {
    type: 'button', class: `kcard k-${content.colorKey(id)} ${size}`, 'data-tap': '', 'data-letter': id,
    'aria-label': anchor ? `${anchor.word} letter` : 'letter',
  });
  if (anchor) card.append(h('em', { 'aria-hidden': 'true' }, anchor.picture));
  card.append(h('b', {}, id.toUpperCase() + id));
  if (!k) card.classList.add('sleeping');
  return card;
}

export function roundButton(kind, label) {
  const icon = { home: 'house', next: 'arrow' }[kind] || kind;
  return h('button', { type: 'button', class: `kbtn ${kind}`, 'data-tap': '', 'aria-label': label, html: ICONS[icon] });
}

/** Add a class for `ms`, then remove it. Re-adding restarts it. */
export function flash(el, cls, ms = 600) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
  clearTimeout(el['_t_' + cls]);
  el['_t_' + cls] = setTimeout(() => el.classList.remove(cls), ms);
}
export const bounce = (el) => flash(el, 'bounce', 650);
export const wiggle = (el) => flash(el, 'wiggle', 700);
export const squish = (el) => flash(el, 'squish', 420);

/** A burst of colour dots from an element (right answer). Purely decorative. */
export function burst(el) {
  if (!el) return;
  const box = h('span', { class: 'burst', 'aria-hidden': 'true' });
  for (let i = 0; i < 10; i++) box.append(h('i', { style: { '--a': `${i * 36}deg`, '--c': `var(--k-${['red', 'orange', 'yellow', 'green', 'blue', 'purple'][i % 6]})` } }));
  el.append(box);
  setTimeout(() => box.remove(), 900);
}

export const wait = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});
