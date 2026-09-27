// Idle escalation (CLAUDE.md K3, K3a). Every kid timing lives in TIMING.
//
// Normal ladder, started after the prompt has finished speaking (K3):
//   ~5s of nothing  -> level 1: repeat the prompt
//   ~12s more       -> level 2: a more specific prompt, stronger pulse
//   then every 8s   -> level 3: pulse + soft chime, no words
//   after a minute  -> level 4: slow pulse only; the chime stops too
// Go-play ladder (K3a, named exception): the prompt is repeated once at ~30s, then quiet,
// because the point of that screen is that the child walks away from it.
//
// Any tap resets the ladder (the kid controller calls reset(); the handler re-arms).

export const TIMING = {
  repeatAfter: 5000,
  specificAfter: 12000,
  chimeEvery: 8000,
  chimeFor: 60000,
  goPlayRepeatAfter: 30000,
  emptyTapVoiceGap: 4000,   // K4: "Tap right here!" at most this often
  speechCheck: 2000,        // wake screen: how long to wait for the voice to start
  wakeAttempts: 3,          // then carry on without speech rather than dead-end (K4)
};

/**
 * @param say       (text) => Promise   speaks one line
 * @param chime     () => void          the soft idle chime
 * @param setLevel  (n) => void         reflects the level on screen (pulse strength)
 */
export function createIdle({ say, chime, setLevel = () => {}, timers = globalThis, now = () => Date.now() }) {
  let pending = [];
  let gen = 0;
  let level = 0;

  const clear = () => { pending.forEach((t) => timers.clearTimeout(t)); pending = []; };
  const setL = (n) => { level = n; setLevel(n); };
  const run = async (p) => { if (typeof p === 'function') await p(); else if (p) await say(p); };

  function later(g, ms, fn) {
    pending.push(timers.setTimeout(() => { if (g === gen) fn(); }, ms));
  }

  return {
    get level() { return level; },
    /** prompts[0] is the repeat, prompts[1] the specific one. Each is a string or an async function. */
    arm({ prompts = [], mode = 'normal' } = {}) {
      clear();
      const g = ++gen;
      setL(0);
      if (mode === 'goplay') {
        later(g, TIMING.goPlayRepeatAfter, async () => { setL(1); await run(prompts[0]); });
        return;
      }
      later(g, TIMING.repeatAfter, async () => {
        setL(1);
        await run(prompts[0]);
        if (g !== gen) return;
        later(g, TIMING.specificAfter, async () => {
          setL(2);
          await run(prompts[1] || prompts[0]);
          if (g !== gen) return;
          const started = now();
          const tick = () => later(g, TIMING.chimeEvery, () => {
            if (now() - started >= TIMING.chimeFor) { setL(4); return; }
            setL(3);
            chime();
            tick();
          });
          tick();
        });
      });
    },
    reset() { clear(); gen++; setL(0); },
    stop() { clear(); gen++; },
  };
}
