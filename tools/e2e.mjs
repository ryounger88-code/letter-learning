// Browser verification of the kid-mode checklist (CLAUDE.md K1–K16), with speech and sound
// replaced by recorders so every spoken line can be checked.
//
//   python3 -m http.server 8765        (in the repo root, in another terminal)
//   node tools/e2e.mjs [http://localhost:8765/] [--shots dir]
//
// Needs Playwright with a Chromium build (not a project dependency; nothing to install for the app).

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')); }
const { chromium } = pw;

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8765/';
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? process.argv[shotsIdx + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = {
  'phone-portrait': { width: 390, height: 844, isMobile: true, hasTouch: true },
  'phone-landscape': { width: 844, height: 390, isMobile: true, hasTouch: true },
  'tablet-portrait': { width: 820, height: 1180, isMobile: true, hasTouch: true },
  'tablet-landscape': { width: 1180, height: 820, isMobile: true, hasTouch: true },
};

// Fake speech engine + audio: records what the app says and how many tones it plays.
const STUBS = () => {
  window.__spoken = [];
  window.__tones = 0;
  class U { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.lang = 'en-US'; } }
  const synth = {
    speaking: false, pending: false, paused: false, _cur: null,
    getVoices() { return [{ name: 'Samantha', lang: 'en-US', voiceURI: 'Samantha', localService: true, default: true }]; },
    speak(u) {
      window.__spoken.push({ text: u.text, at: Date.now() });
      this.speaking = true; this._cur = u;
      setTimeout(() => u.onstart && u.onstart(), 10);
      u._t = setTimeout(() => { if (this._cur === u) { this.speaking = false; this._cur = null; } u.onend && u.onend(); }, 150 + u.text.length * 25);
    },
    cancel() { if (this._cur) { const u = this._cur; clearTimeout(u._t); this._cur = null; this.speaking = false; u.onerror && u.onerror({ error: 'canceled' }); } },
    resume() {}, pause() {}, addEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
  class AC {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createOscillator() { const g = this.createGain(); return { type: '', frequency: { setValueAtTime() {} }, connect: () => g, start: () => { window.__tones++; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ({}) }; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, start() {} }; }
    resume() {}
  }
  window.AudioContext = AC;
};

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const spoken = (page) => page.evaluate(() => window.__spoken.map((s) => s.text));
const lastSpoken = async (page) => (await spoken(page)).slice(-1)[0];
// Pulsing targets never settle, so tap by position like a finger would.
async function tap(page, selector) {
  const el = await page.waitForSelector(selector, { state: 'visible' });
  await el.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.bottom > innerHeight || r.top < 0) e.scrollIntoView({ block: 'center' }); });
  const b = await el.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

async function kidAudit(page, label) {
  // K1 text, K5 sizes, K8 navigation, K14 horizontal scroll, K7 home
  const a = await page.evaluate(() => {
    const root = document.getElementById('kid-root');
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const texts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const t = walker.currentNode.textContent.trim(); if (t && visible(walker.currentNode.parentElement)) texts.push(t); }
    const taps = [...root.querySelectorAll('[data-tap]')].filter(visible).map((el) => { const r = el.getBoundingClientRect(); return { cls: el.className, w: Math.round(r.width), h: Math.round(r.height) }; });
    const links = root.querySelectorAll('a, [target], form, iframe').length;
    const home = root.querySelector('.kid-home');
    return {
      texts, taps, links,
      hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 || root.scrollWidth > root.clientWidth + 1,
      homeVisible: !!home && visible(home), screen: root.dataset.screen,
    };
  });
  const emoji = /^\p{Extended_Pictographic}/u;
  const badText = a.texts.filter((t) => !/^[A-Za-z]{1,2}$/.test(t) && !/^[a-z]+$/.test(t) && !emoji.test(t));
  check(`${label}: only letters, words and pictures on screen (K1)`, badText.length === 0, badText.join(' | '));
  const small = a.taps.filter((t) => t.w < 90 || t.h < 90);
  check(`${label}: every tap target ≥ 90px (K5)`, small.length === 0, small.map((s) => `${s.cls} ${s.w}×${s.h}`).join(', '));
  check(`${label}: no links, forms or frames (K8)`, a.links === 0);
  check(`${label}: no horizontal scroll (K14)`, !a.hscroll);
  if (a.screen !== 'wake') check(`${label}: home button visible (K7)`, a.homeVisible);
  return a;
}

async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

async function setupParent(page) {
  await page.goto(BASE);
  await page.waitForSelector('#setup');
  await page.fill('#f-name', 'Testkid');
  await page.check('input[name=pronoun][value=he]');
  await page.click('#setup button[type=submit]');
  await page.waitForSelector('.nextup');
}

async function runViewport(browser, vpName) {
  const ctx = await browser.newContext({ viewport: { width: VIEWPORTS[vpName].width, height: VIEWPORTS[vpName].height }, isMobile: VIEWPORTS[vpName].isMobile, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(STUBS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await setupParent(page);
  await shot(page, `${vpName}-parent-home`);
  check(`${vpName}: parent home renders with the child's name`, (await page.textContent('#parent-root')).includes('Hand it to Testkid'));

  // Parent lesson + rating still work
  await page.click('#nu-go');
  await page.waitForSelector('.lhead');
  const lessonText = await page.textContent('#parent-root');
  check(`${vpName}: lesson fills placeholders`, !/\{(child|them|their|themself|CHILD)\}/.test(lessonText) && lessonText.includes('TESTKID'));
  await shot(page, `${vpName}-parent-lesson`);
  await page.click('.rateopt.loved');
  await page.click('#save');
  check(`${vpName}: rating saves`, (await page.textContent('#saved')).startsWith('Saved'));
  await page.click('#back');
  await page.waitForSelector('.logrow');

  // Hand off
  await page.click('[data-hand]');
  await page.waitForSelector('.kid .wake-ball');
  await kidAudit(page, `${vpName} wake`);
  await shot(page, `${vpName}-kid-wake`);
  await page.mouse.click(VIEWPORTS[vpName].width / 2, VIEWPORTS[vpName].height / 2);
  await page.waitForSelector('.kid[data-screen="pick"] .kcard.is-target', { timeout: 8000 });
  check(`${vpName}: wake tap speaks the greeting first (K10)`, (await spoken(page))[0].startsWith('Hi, Testkid'));
  await page.waitForTimeout(600);
  await kidAudit(page, `${vpName} pick`);
  await shot(page, `${vpName}-kid-pick`);
  const ready = await page.$$eval('.pick .ready .kcard', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return r.bottom <= window.innerHeight; }));
  check(`${vpName}: all playable letters visible without scrolling`, ready.length === 4 && ready.every(Boolean));

  // Empty-space tap bounces the target and speaks (K4)
  const before = (await spoken(page)).length;
  await page.waitForTimeout(1500);
  const box = await page.$eval('.kid-stage', (e) => { const r = e.getBoundingClientRect(); return { x: r.left + 4, y: r.bottom - 6 }; });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(80);
  const bounced = await page.$eval('.kcard.is-target', (e) => e.classList.contains('bounce'));
  await page.waitForTimeout(400);
  check(`${vpName}: empty tap bounces the target (K4)`, bounced);
  check(`${vpName}: empty tap is spoken to (K4)`, (await spoken(page)).slice(before).some((t) => t === 'Tap right here!'));

  // Sleeping letter is not a dead end
  await tap(page, '.asleep .kcard >> nth=0');
  await page.waitForTimeout(300);
  check(`${vpName}: sleeping letter suggests a ready one`, (await lastSpoken(page)).includes('still sleeping'));

  // Journey: L
  await tap(page, '.pick .ready .kcard[data-letter="l"]');
  await page.waitForSelector('.hear .kcard.hero', { timeout: 5000 });
  await page.waitForTimeout(700);
  check(`${vpName}: hear-it calls the letter by its picture (K12)`, (await spoken(page)).some((t) => t === 'This is the lion letter. Tap it!'));
  await kidAudit(page, `${vpName} hear-it`);
  await tap(page, '.hear .kcard');
  await page.waitForTimeout(400);
  await tap(page, '.hear .kcard');
  await page.waitForSelector('.hear .kbtn.next.is-target', { timeout: 8000 });
  await shot(page, `${vpName}-kid-hear`);
  await tap(page, '.hear .kbtn.next');
  for (let i = 0; i < 4; i++) {
    await page.waitForSelector('.words .kbtn.next.is-target', { timeout: 8000 });
    if (i === 0) { await kidAudit(page, `${vpName} words`); await shot(page, `${vpName}-kid-words`); }
    await tap(page, '.words .kbtn.next');
  }
  await page.waitForSelector('.choice .pic-card', { timeout: 5000 });
  await page.waitForTimeout(200);
  const ask = (await spoken(page)).slice(-1)[0];
  check(`${vpName}: find-it first ask doesn't name the answer (K11)`, /^Which one starts with/.test(ask) && !/Tap the/.test(ask), ask);
  const equal = await page.$$eval('.choice .pic-card', (els) => els.every((e) => e.classList.contains('is-equal')) && !els.some((e) => e.classList.contains('is-target')));
  check(`${vpName}: find-it options breathe equally, none ringed (K11)`, equal);
  await kidAudit(page, `${vpName} find-it`);
  await shot(page, `${vpName}-kid-findit`);
  const labels = await page.$$eval('.choice .pic-card', (els) => els.map((e) => e.getAttribute('aria-label')));
  const lWords = ['leaf', 'lemon', 'ladybug', 'lion'];
  const wrongIdx = labels.findIndex((w) => !lWords.includes(w));
  const rightIdx = labels.findIndex((w) => lWords.includes(w));
  check(`${vpName}: exactly one L picture among the options`, labels.filter((w) => lWords.includes(w)).length === 1, labels.join(','));
  await tap(page, `.choice .pic-card >> nth=${wrongIdx}`);
  await page.waitForTimeout(300);
  const wrongLine = await lastSpoken(page);
  check(`${vpName}: wrong tap names it, says its sound, points back`, /starts with .*Which one starts like lion\?$/.test(wrongLine), wrongLine);
  check(`${vpName}: after a wrong tap the right picture glows`, await page.$eval(`.choice .pic-card >> nth=${rightIdx}`, (e) => e.classList.contains('is-target')).catch(() => false)
    || await page.$$eval('.choice .pic-card', (els, i) => els[i].classList.contains('is-target'), rightIdx));
  await tap(page, `.choice .pic-card >> nth=${rightIdx}`);
  await page.waitForSelector('.star-wrap', { timeout: 8000 });
  await shot(page, `${vpName}-kid-star`);
  await page.waitForSelector('.goplay .kbtn.check.is-target', { timeout: 10000 });
  await page.waitForTimeout(300);
  await kidAudit(page, `${vpName} go-play`);
  await shot(page, `${vpName}-kid-goplay`);
  check(`${vpName}: go-play names the family's grown-ups`, (await spoken(page)).some((t) => t.includes('Mom or Dad')));
  await tap(page, '.goplay .kbtn.check');
  await page.waitForSelector('.gp-choices .kcard.is-target', { timeout: 10000 });
  check(`${vpName}: next letter card becomes the target after ✓`, true);
  await tap(page, '.gp-choices .kcard');
  await page.waitForSelector('.hear .kcard.k-red', { timeout: 5000 });
  check(`${vpName}: next letter is M`, true);

  // Home, one tap, from mid-journey (K7)
  await tap(page, '.kid-home');
  await page.waitForSelector('.kid[data-screen="pick"]');
  check(`${vpName}: home goes to the picker in one tap (K7)`, true);
  const strip = await page.$$eval('.kid-strip .star', (s) => s.length);
  check(`${vpName}: star strip shows the earned star`, strip === 1);

  // Parent gate: short tap does nothing but react; 3s hold exits (K9)
  const g = await page.$eval('.kid-gate', (e) => { const r = e.getBoundingClientRect(); return { x: r.right - 50, y: r.top + 50 }; });
  await page.mouse.click(g.x, g.y);
  await page.waitForTimeout(200);
  check(`${vpName}: a quick tap on the gate stays in kid mode (K9)`, await page.isVisible('#kid-root'));
  await page.mouse.move(g.x, g.y); await page.mouse.down(); await page.waitForTimeout(3200); await page.mouse.up();
  await page.waitForSelector('#parent-root:not([hidden]) .nextup', { timeout: 3000 });
  check(`${vpName}: 3-second hold opens parent mode (K9)`, true);

  // Events
  const ev = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ll1:ev:')).flatMap((k) => JSON.parse(localStorage.getItem(k))));
  const types = new Set(ev.map((e) => e.type));
  const need = ['session.start', 'letter.open', 'activity.start', 'findit.result', 'letter.star', 'goplay.shown', 'goplay.done', 'letter.left', 'session.end', 'parent.session', 'speech.check', 'tap.empty'];
  check(`${vpName}: events logged`, need.every((t) => types.has(t)), need.filter((t) => !types.has(t)).join(','));
  check(`${vpName}: every event has learnerId and deviceId`, ev.every((e) => e.learnerId && e.deviceId && e.id && e.at));
  const fi = ev.find((e) => e.type === 'findit.result');
  check(`${vpName}: find-it logs attempts, timing, idle level, firstTry`, fi && fi.data.attempts.length === 2 && fi.data.firstTry === false && 'msToFirstTap' in fi.data && 'idleLevelBeforeFirstTap' in fi.data && fi.data.attempts[0].word);

  check(`${vpName}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

async function idleTimings(browser) {
  // Fake clock: measure each idle step from the moment the previous line finished speaking.
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(STUBS);
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-09-27T10:00:00Z') });
  await setupParent(page);
  await page.click('[data-hand]');
  await page.waitForSelector('.wake-ball');
  await page.mouse.click(400, 600);
  await page.clock.runFor(3000);
  await page.waitForSelector('.kid[data-screen="pick"]');
  await page.clock.runFor(60000);
  const log = await page.evaluate(() => window.__spoken);
  const tones = await page.evaluate(() => window.__tones);
  const dur = (t) => 150 + t.length * 25; // the fake engine's speaking time
  const i0 = log.findIndex((s) => s.text === 'Tap a letter!');
  const [ask, rep, spec] = [log[i0], log[i0 + 1], log[i0 + 2]];
  const gap1 = rep.at - (ask.at + dur(ask.text));
  const gap2 = spec.at - (rep.at + dur(rep.text));
  check('idle: prompt repeated ~5s after it finished (K3)', rep.text === 'Tap a letter!' && gap1 >= 4900 && gap1 <= 5300, `${gap1}ms`);
  check('idle: specific prompt ~12s after that (K3)', /Tap the green lion letter/.test(spec.text) && gap2 >= 11900 && gap2 <= 12300, `${spec.text} after ${gap2}ms`);
  check('idle: no more words after the specific prompt (K3)', log.length === i0 + 3, log.slice(i0 + 3).map((s) => s.text).join(' | '));
  check('idle: soft chimes after that (K3)', tones >= 4, `${tones} tones`);
  const t0 = await page.evaluate(() => window.__tones);
  await page.clock.runFor(60000);
  const t1 = await page.evaluate(() => window.__tones);
  await page.clock.runFor(30000);
  check('idle: chime stops after about a minute; slow pulse only (K3)', (await page.evaluate(() => window.__tones)) === t1 && (await page.getAttribute('#kid-root', 'data-idle')) === '4', `tones ${t0}→${t1}`);
  // A tap resets the ladder
  const b = await (await page.$('.pick .ready .kcard[data-letter="m"]')).boundingBox();
  await page.mouse.click(10, 1150);
  await page.clock.runFor(300);
  check('idle: any tap resets the ladder (K3)', (await page.getAttribute('#kid-root', 'data-idle')) === '0');
  await ctx.close();
}

async function goPlayIdle(browser) {
  // K3a: on go-play the prompt is said once, repeated once at ~30s, then silence.
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(STUBS);
  const page = await ctx.newPage();
  await page.clock.install(); // before load, so the app's timers are fake from the start
  await setupParent(page);
  await page.click('[data-hand]');
  await page.waitForSelector('.wake-ball');
  await page.mouse.click(400, 600);
  await page.waitForSelector('.kid[data-screen="pick"] .kcard.is-target');
  await tap(page, '.pick .ready .kcard[data-letter="s"]');
  await page.waitForSelector('.hear .kcard.hero');
  await page.waitForTimeout(500);
  await tap(page, '.hear .kcard'); await page.waitForTimeout(300); await tap(page, '.hear .kcard');
  await tap(page, '.hear .kbtn.next.is-target');
  for (let i = 0; i < 4; i++) await tap(page, '.words .kbtn.next.is-target');
  await page.waitForSelector('.choice .pic-card');
  const labels = await page.$$eval('.choice .pic-card', (els) => els.map((e) => e.getAttribute('aria-label')));
  const idx = labels.findIndex((w) => ['sun', 'sock', 'sandwich', 'seal'].includes(w));
  await tap(page, `.choice .pic-card >> nth=${idx}`);
  await page.waitForSelector('.goplay .kbtn.check.is-target', { timeout: 10000 });
  await page.waitForTimeout(1500); // the prompt finishes
  const n0 = (await spoken(page)).length;
  await page.clock.runFor(25000);
  check('go-play: quiet for the first ~30s (K3a)', (await spoken(page)).length === n0);
  await page.clock.runFor(8000);
  const s = (await spoken(page)).slice(n0);
  check('go-play: prompt repeated once at ~30s (K3a)', s.length === 1 && /sock/.test(s[0]), s.join(' | '));
  await page.clock.runFor(120000);
  check('go-play: then silence, no chimes (K3a)', (await spoken(page)).length === n0 + 1);
  await ctx.close();
}

async function offlineAndVoiceCheck(browser) {
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  await ctx.addInitScript(STUBS);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setupParent(page);
  await page.click('#to-voice');
  await page.waitForSelector('.vc-letter');
  check('voice check: lists every switched-on letter', (await page.$$('.vc-letter')).length === 4);
  const n = (await spoken(page)).length;
  await page.click('.vc-letter .vc-play');
  await page.waitForTimeout(200);
  check('voice check: ▶ plays the line', (await spoken(page)).length === n + 1);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(2500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('.nextup', { timeout: 10000 });
  check('offline: the app reloads with the network off', true);
  check('offline: the bundled Andika font is available', await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 40px Andika'); }));
  await page.click('[data-hand]');
  await page.waitForSelector('.wake-ball');
  check('offline: kid mode starts with the network off', true);
  check('offline/voice check: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const vp of Object.keys(VIEWPORTS)) {
  try { await runViewport(browser, vp); } catch (e) { check(`${vp}: flow completed`, false, e.message.split('\n')[0]); }
}
try { await idleTimings(browser); } catch (e) { check('idle timings completed', false, e.message.split('\n')[0]); }
try { await offlineAndVoiceCheck(browser); } catch (e) { check('offline/voice check completed', false, e.message.split('\n')[0]); }
try { await goPlayIdle(browser); } catch (e) { check('go-play idle completed', false, e.message.split('\n')[0]); }
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
