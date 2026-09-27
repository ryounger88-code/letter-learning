// Kid mode controller: the wake screen, the letter picker, and running a journey of activities.
// The numbered rules (K1…) are the checklist in CLAUDE.md; each is cited where it is enforced.

import { h, ICONS, RIDGE_SVG, kidCard, roundButton, bounce, wiggle, squish, flash, wait } from './ui.js';
import { createIdle, TIMING } from './idle.js';
import { getActivity } from './registry.js';
import { chooseNext } from '../choose-next.js';
import { line, COLOR_NAMES, RATE } from '../voice.js';
import { fill, learnerVars, joinOr } from '../text.js';

export function startKidMode({ root, store, content, speech, sounds, learner, onExit }) {
  const family = store.getFamily();
  const sessionId = 's' + Date.now().toString(36);
  const log = (type, extra = {}) => {
    try { store.recordEvent({ learnerId: learner.id, sessionId, type, ...extra }); } catch (e) { console.error(e); }
  };

  // ---------- chrome: background, home (K7), parent gate (K9), star strip, stage ----------
  // K8: kid mode builds only buttons and divs. No links, forms, new windows or history changes.
  root.replaceChildren();
  root.hidden = false;
  root.className = 'kid';
  root.setAttribute('data-screen', 'wake');
  const bg = h('div', { class: 'kid-bg', 'aria-hidden': 'true', html: RIDGE_SVG });
  const home = roundButton('home', 'Home');
  home.classList.add('kid-home');
  const strip = h('div', { class: 'kid-strip', 'data-tap': '', 'aria-label': 'Stars' });
  const gate = h('div', { class: 'kid-gate', 'aria-hidden': 'true' },
    h('span', { class: 'gate-ring', html: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/></svg>' }));
  const stageEl = h('main', { class: 'kid-stage' });
  root.append(bg, stageEl, home, strip, gate);

  let exited = false;
  let screen = 'wake';
  let journeyAbort = null;
  let currentActivity = null;
  let currentLetter = null;
  let targets = [];
  let lastPrompt = '';
  let lastArm = null;
  let lastTapVoice = 0;
  let lastEmptyLog = 0;

  const idle = createIdle({
    say: (t) => say(t),
    chime: () => sounds.chime(),
    setLevel: (n) => root.setAttribute('data-idle', String(n)),
  });

  // Common placeholder values for every line (voice.js lists them).
  function vars(letter = currentLetter, extra = {}) {
    const k = letter ? content.kid(letter) : null;
    const a = letter ? content.anchor(letter) : null;
    return {
      ...learnerVars(learner),
      grownups: joinOr(store.getFamily().grownups),
      sound: k ? k.kidSound : '',
      anchor: a ? a.word : '',
      color: letter ? COLOR_NAMES[content.colorKey(letter)] : '',
      ...extra,
    };
  }
  async function say(text, opts) {
    if (!text || exited) return;
    lastPrompt = text;
    await speech.say(text, opts);
  }
  function setTarget(elOrList, { equal = false, strong = false } = {}) {
    for (const t of targets) t.classList.remove('is-target', 'is-equal', 'is-strong');
    targets = (Array.isArray(elOrList) ? elOrList : [elOrList]).filter(Boolean);
    for (const t of targets) { t.classList.add(equal ? 'is-equal' : 'is-target'); if (strong) t.classList.add('is-strong'); }
  }
  function arm(prompts, mode = 'normal') { lastArm = { prompts, mode }; idle.arm({ prompts, mode }); }

  // ---------- every tap does something (K4); taps reset idle (K3); re-prime after backgrounding (K10) ----------
  root.addEventListener('pointerdown', () => { sounds.resume(); }, true);
  root.addEventListener('click', (e) => {
    if (exited) return;
    if (speech.needsPrime && screen !== 'wake') {
      // iOS drops speech after backgrounding: the first tap back speaks from inside the gesture.
      e.stopPropagation();
      speech.prime(lastPrompt || line('pick.ask'));
      targets.forEach(bounce);
      return;
    }
    idle.reset();
    if (screen === 'wake') return; // the wake screen handles its own taps
    if (e.target.closest('[data-tap]')) return; // handled by the element
    emptyTap();
  }, true);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('gesturestart', (e) => e.preventDefault());

  function emptyTap() {
    if (!targets.length) { sounds.pop(); return; } // nothing to point at (a celebration): a soft sound
    targets.forEach(bounce);
    const t = Date.now();
    if (t - lastEmptyLog > 1000) { lastEmptyLog = t; log('tap.empty', { letter: currentLetter, activity: currentActivity }); }
    const tooSoon = t - lastTapVoice < TIMING.emptyTapVoiceGap;
    if (!speech.speaking && !tooSoon) {
      lastTapVoice = t;
      const text = targets.length > 1 ? line('common.tapPicture') : line('common.tapHere');
      speech.say(text).then(() => { if (lastArm && !exited) idle.arm(lastArm); });
    } else if (lastArm) idle.arm(lastArm);
  }

  /** Attach a tap handler that ignores taps after the screen has moved on. */
  function onTap(el, fn) {
    el.setAttribute('data-tap', '');
    el.addEventListener('click', (e) => { if (!exited) { idle.reset(); fn(e); } });
  }

  // ---------- K7: home, one tap, no confirmation ----------
  onTap(home, () => {
    if (journeyAbort) {
      log('letter.left', { letter: currentLetter, activity: currentActivity });
      journeyAbort.abort();
      journeyAbort = null;
    }
    speech.cancel();
    if (screen === 'pick') { const s = suggestion(); say(line('pick.home')); targets.forEach(bounce); if (s) arm(pickPrompts(s)); return; }
    showPick();
  });

  // ---------- K9: parent gate, three-second hold on the top-right corner ----------
  let gateTimer = null;
  let gateShow = null;
  const gateCancel = () => { clearTimeout(gateTimer); clearTimeout(gateShow); gate.classList.remove('holding'); };
  gate.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gateCancel();
    gateShow = setTimeout(() => gate.classList.add('holding'), 1000);
    gateTimer = setTimeout(exit, 3000);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => gate.addEventListener(ev, gateCancel));

  function exit() {
    if (exited) return;
    exited = true;
    gateCancel();
    idle.stop();
    speech.cancel();
    if (journeyAbort) { log('letter.left', { letter: currentLetter, activity: currentActivity, data: { reason: 'parent-gate' } }); journeyAbort.abort(); }
    log('session.end', { data: { reason: 'parent-gate' } });
    root.hidden = true;
    root.replaceChildren();
    onExit();
  }

  // ---------- star strip (top centre; never in the gate corner, K9) ----------
  function renderStrip() {
    const stars = store.getProgress(learner.id).stars;
    const max = Math.max(4, Math.floor((strip.clientWidth || 300) / 36));
    strip.replaceChildren(...stars.slice(-max).map((s) =>
      h('span', { class: `star s-${content.colorKey(s.letter)}`, 'data-letter': s.letter, html: ICONS.star })));
  }
  onTap(strip, (e) => {
    const stars = [...strip.querySelectorAll('.star')];
    if (!stars.length) { emptyTap(); return; }
    const x = e.clientX;
    const s = stars.reduce((best, el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x);
      return !best || d < best.d ? { el, d } : best;
    }, null).el;
    flash(s, 'twinkle', 700);
    sounds.twinkle();
    const k = content.kid(s.dataset.letter);
    if (k) speech.say(k.kidSound, { rate: RATE.sound }).then(() => { if (lastArm) idle.arm(lastArm); });
  });

  // ---------- Screen 0: wake (K10). The whole screen is the button; the only screen without home (K7). ----------
  function showWake() {
    screen = 'wake';
    root.setAttribute('data-screen', 'wake');
    const ball = h('div', { class: 'wake-ball', 'aria-label': 'Start' });
    stageEl.replaceChildren(h('div', { class: 'wake' }, ball));
    let attempts = 0;
    let busy = false;
    const onWake = async (e) => {
      if (screen !== 'wake' || busy || exited) return;
      if (gate.contains(e.target)) return;
      busy = true;
      attempts++;
      sounds.unlock();
      const ok = await speech.unlock(fill(line('wake.greeting'), vars(null)), TIMING.speechCheck); // first utterance, inside the tap
      log('speech.check', { data: { ok, attempt: attempts, voice: (speech.currentVoice() || {}).name || null } });
      if (ok || attempts >= TIMING.wakeAttempts) {
        ball.classList.add('pop');
        await Promise.race([wait(4000), speechDone()]);
        root.removeEventListener('click', onWake);
        showPick();
      } else {
        ball.classList.add('retry'); // a silent failure becomes a visible retry
        busy = false;
      }
    };
    root.addEventListener('click', onWake);
  }
  function speechDone() { return new Promise((r) => { const t = setInterval(() => { if (!speech.speaking) { clearInterval(t); r(); } }, 120); }); }

  // ---------- Screen 1: pick a letter ----------
  function suggestion(exclude) { return chooseNext(learner, store.getProgress(learner.id), content, { exclude }); }
  function pickPrompts(s) {
    const nameStarts = (learner.name || '')[0] && learner.name[0].toLowerCase() === s.letter;
    return [line('pick.idle1'), fill(line(nameStarts ? 'pick.idle2Name' : 'pick.idle2'), vars(s.letter))];
  }
  function showPick() {
    screen = 'pick';
    currentLetter = null;
    currentActivity = null;
    root.setAttribute('data-screen', 'pick');
    renderStrip();
    const playable = content.kidReadyLetters();
    const s = suggestion();
    const cards = playable.map((id) => kidCard(content, id));
    const sleeping = content.order.filter((id) => !playable.includes(id)).map((id) => {
      const c = kidCard(content, id, { size: 'small' });
      c.classList.add('sleeping');
      c.querySelector('em')?.remove();
      return c;
    });
    stageEl.replaceChildren(h('div', { class: 'pick' },
      h('div', { class: `ready n${cards.length}` }, ...cards),
      sleeping.length ? h('div', { class: 'asleep' }, ...sleeping) : null));
    const cardFor = (id) => cards[playable.indexOf(id)];
    if (s) setTarget(cardFor(s.letter));
    cards.forEach((c) => onTap(c, async () => {
      sounds.pop();
      c.classList.add('chosen');
      speech.cancel();
      await wait(300);
      runJourney(c.dataset.letter, 'pick');
    }));
    sleeping.forEach((c) => onTap(c, async () => {
      wiggle(c);
      c.classList.add('zzz');
      setTimeout(() => c.classList.remove('zzz'), 1600);
      sounds.boop();
      if (s) { setTarget(cardFor(s.letter)); await say(fill(line('pick.sleeping'), vars(s.letter))); arm(pickPrompts(s)); }
    }));
    (async () => { await say(line('pick.ask')); if (screen === 'pick' && s) arm(pickPrompts(s)); })();
  }

  // ---------- Screen 2: a journey (activities from content/plans.json) ----------
  async function runJourney(letter, via, journeyId = 'letter') {
    idle.stop();
    speech.cancel();
    if (journeyAbort) journeyAbort.abort();
    const ac = new AbortController();
    journeyAbort = ac;
    screen = 'journey';
    currentLetter = letter;
    root.setAttribute('data-screen', 'journey');
    renderStrip();
    try { store.recordLetterVisit(learner.id, letter, { via, journey: journeyId }, sessionId); } catch (e) { console.error(e); }
    const shared = {};
    let next = null;
    for (const id of content.plans.journeys[journeyId]) {
      if (ac.signal.aborted || exited) return;
      const act = getActivity(id);
      if (!act) continue;
      currentActivity = id;
      root.setAttribute('data-activity', id);
      setTarget([]);
      log('activity.start', { letter, activity: id });
      const result = await act.run(makeCtx(letter, id, ac.signal, shared));
      if (ac.signal.aborted || exited) return;
      log('activity.end', { letter, activity: id, data: result && result.summary ? result.summary : {} });
      if (result && result.next) next = result.next;
    }
    if (journeyAbort === ac) journeyAbort = null;
    idle.stop();
    if (next && next.kind === 'again') runJourney(letter, 'again');
    else if (next && next.kind === 'letter') runJourney(next.letter, 'next');
    else showPick();
  }

  function makeCtx(letter, activityId, signal, shared) {
    return {
      learner, letter, content, store, speech, sounds, signal, shared,
      stage: stageEl,
      kid: content.kid(letter),
      anchor: content.anchor(letter),
      colorKey: content.colorKey(letter),
      fill: (text, extra) => fill(text, vars(letter, extra)),
      say: async (text, opts) => { if (!signal.aborted) await say(text, opts); },
      setTarget, clearTarget: () => setTarget([]),
      arm: (prompts, mode) => { if (!signal.aborted) arm(prompts, mode); },
      idleLevel: () => idle.level,
      onTap,
      log: (type, data = {}) => log(type, { letter, activity: activityId, data }),
      suggestNext: () => chooseNext(learner, store.getProgress(learner.id), content, { exclude: letter }),
      card: (id, opts) => kidCard(content, id, opts),
      renderStrip,
      strip,
      bounce, squish, wait: (ms) => wait(ms, signal),
    };
  }

  log('session.start', { data: { mode: 'kid' } });
  showWake();
  return { exit };
}
