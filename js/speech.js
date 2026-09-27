// Speech engine wrapper around the browser's built-in speechSynthesis. See CLAUDE.md, K10.
//
// Gotchas handled here, learned from iOS Safari and Chrome:
//  - iOS stays silent until the first utterance is spoken from inside a user tap. unlock() and
//    prime() speak synchronously, so call them directly from a tap handler.
//  - The voice list loads asynchronously (voiceschanged); pick the voice at speak time.
//  - Utterances queue up unless cancelled, so say() always cancels what is playing first.
//    Safari can drop an utterance spoken in the same tick as cancel(), hence the short gap.
//  - onend sometimes never fires (iOS, Chrome). Every say() has a safety timeout, so the
//    app never waits forever on a sentence.
//  - iOS drops speech after the app is backgrounded. On return, needsPrime is set and the next
//    tap re-primes with prime().
//
// Rates and every spoken string live in js/voice.js, not here.

import { RATE } from './voice.js';

const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo\b|grandma|grandpa|reed|rocko|sandy|shelley/i;

export function createSpeech({
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  getPreferredVoice = () => null,
  doc = globalThis.document,
} = {}) {
  const supported = !!(synth && Utterance);
  let voiceList = [];
  let current = null; // { u, finish }
  let seq = 0;
  const state = { needsPrime: false, lastStartOk: null };

  function loadVoices() {
    try { voiceList = (synth.getVoices() || []).filter((v) => /^en([-_]|$)/i.test(v.lang)); } catch { voiceList = []; }
  }
  if (supported) {
    loadVoices();
    const h = () => loadVoices();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', h); else synth.onvoiceschanged = h;
  }
  if (doc) {
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden && supported) { try { synth.cancel(); } catch {} }
      if (!doc.hidden) state.needsPrime = true;
    });
  }

  function score(v) {
    let s = 0;
    if (/en[-_]US/i.test(v.lang)) s += 50; else if (/en[-_](GB|AU|CA|IE|NZ)/i.test(v.lang)) s += 30;
    if (/samantha/i.test(v.name)) s += 60;
    if (/enhanced|premium|natural|neural/i.test(v.name)) s += 25;
    if (/google us english|aria|jenny|ava|allison|susan/i.test(v.name)) s += 40;
    if (v.localService) s += 10;
    if (NOVELTY.test(v.name)) s -= 200;
    return s;
  }
  function pickVoice() {
    if (!voiceList.length) loadVoices();
    const want = getPreferredVoice();
    if (want) { const v = voiceList.find((x) => x.voiceURI === want); if (v) return v; }
    return [...voiceList].sort((a, b) => score(b) - score(a))[0] || null;
  }

  function speakNow(text, opts, onStart) {
    return new Promise((resolve) => {
      const u = new Utterance(text);
      const v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = opts.rate ?? RATE.normal;
      u.pitch = opts.pitch ?? RATE.pitch;
      u.volume = 1;
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (current && current.u === u) current = null;
        resolve(r);
      };
      const timer = setTimeout(() => finish({ ended: true, timedOut: true }), Math.max(2500, (text.length * 110) / (u.rate || 1)) + 1500);
      u.onstart = () => { state.lastStartOk = true; if (onStart) onStart(); };
      u.onend = () => finish({ ended: true });
      u.onerror = (e) => finish({ ended: false, error: e && e.error });
      current = { u, finish };
      try { if (synth.paused) synth.resume(); } catch {}
      synth.speak(u);
    });
  }

  function stopCurrent() {
    if (current) { const c = current; current = null; c.finish({ cancelled: true }); }
  }

  const speech = {
    supported,
    get needsPrime() { return state.needsPrime; },
    get speaking() { return !!current; },
    voices: () => { loadVoices(); return voiceList.slice(); },
    currentVoice: () => (supported ? pickVoice() : null),

    /**
     * Call synchronously from the very first tap. Speaks `text` right away and resolves to
     * true if the voice actually started within `timeoutMs`, false if it stayed silent.
     */
    unlock(text, timeoutMs = 2000) {
      if (!supported) return Promise.resolve(false);
      state.needsPrime = false;
      stopCurrent();
      return new Promise((resolve) => {
        let settled = false;
        const t = setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, timeoutMs);
        speakNow(text, {}, () => { if (!settled) { settled = true; clearTimeout(t); resolve(true); } });
      });
    },
    /** After the app comes back from the background: speak from inside the tap to wake iOS speech. */
    prime(text) {
      if (!supported) return Promise.resolve({ ended: false });
      state.needsPrime = false;
      stopCurrent();
      try { synth.cancel(); } catch {}
      return speakNow(text, {});
    },
    /** Speak one line. Cancels whatever is playing. Resolves when it ends, is cancelled, or times out. */
    say(text, opts = {}) {
      if (!supported || !text) return Promise.resolve({ ended: false });
      const my = ++seq;
      const busy = !!current || synth.speaking || synth.pending;
      stopCurrent();
      if (busy) {
        try { synth.cancel(); } catch {}
        return new Promise((r) => setTimeout(r, 70)).then(() => (my === seq ? speakNow(text, opts) : { cancelled: true }));
      }
      return speakNow(text, opts);
    },
    cancel() { seq++; stopCurrent(); if (supported) { try { synth.cancel(); } catch {} } },
  };
  return speech;
}
