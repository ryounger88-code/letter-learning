// Small sounds made by the browser itself (Web Audio). No audio files.
// iOS only plays these after unlock() has run inside a tap, like speech.

export function createSounds(win = globalThis) {
  let ctx = null;
  const AC = win.AudioContext || win.webkitAudioContext;

  function ready() {
    if (!ctx) return false;
    if (ctx.state !== 'running') { try { ctx.resume(); } catch {} }
    return true;
  }
  function tone(freq, start, dur, gain = 0.12, type = 'sine') {
    if (!ready()) return;
    const t0 = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  return {
    /** Call from inside a tap. */
    unlock() {
      if (!AC) return;
      try {
        if (!ctx) ctx = new AC();
        if (ctx.state !== 'running') ctx.resume();
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch {}
    },
    resume() { ready(); },
    chime() { tone(880, 0, 0.35, 0.09); tone(1318.5, 0.12, 0.5, 0.08); },   // K3: idle nudge, soft
    tada() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.45, 0.1, 'triangle')); },
    pop() { tone(620, 0, 0.09, 0.07, 'triangle'); },                          // a tap landed
    boop() { tone(300, 0, 0.2, 0.08); tone(240, 0.12, 0.25, 0.07); },         // sleeping letter
    twinkle() { tone(1568, 0, 0.15, 0.06); tone(2093, 0.08, 0.2, 0.05); },
  };
}
