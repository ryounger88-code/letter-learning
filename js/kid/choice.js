// The "which one starts with…" question: three pictures, one right. Used by find-it, and by
// the mix-up game in v1.1.
//
// K11: the first ask never names the answer, and all three pictures breathe equally.
// Only the hint ladder names the answer and makes it glow. firstTry is true only when the
// first tap is right and no hint was given. A wrong tap is warm, never a buzzer, and the right
// picture glows brighter each time. The child cannot fail.
//
// Logged per question (store.recordFindItResult): the three options and their positions, every
// attempt with the picture tapped, ms from the end of the question to the tap, and the idle level
// showing at that moment; ms to the first tap; whether a hint was given; firstTry.

import { h, burst, bounce } from './ui.js';
import { cap } from '../text.js';
import { line } from '../voice.js';

export function askChoice(ctx, { target, options, activity }) {
  const { stage, signal } = ctx;
  const vars = { word: target.word, Word: cap(target.word) };
  const cards = options.map((o) => {
    const b = h('button', { type: 'button', class: 'pic-card', 'data-tap': '', 'aria-label': o.word }, h('span', { class: 'pic' }, o.picture));
    b._opt = o;
    return b;
  });
  const correct = cards[options.indexOf(target)];
  stage.replaceChildren(h('div', { class: 'choice' }, ...cards));
  ctx.setTarget(cards, { equal: true });

  const attempts = [];
  let promptEnd = null;
  let hinted = false;
  let wrongs = 0;
  let idleLevelBeforeFirstTap = null;
  let msToFirstTap = null;

  const hint = async () => {
    hinted = true;
    correct.classList.add('glow-2');
    ctx.setTarget(correct, { strong: true });
    await ctx.say(ctx.fill(line('findit.hint'), vars));
  };
  const armIdle = () => ctx.arm([ctx.fill(line('findit.idle1')), hint]);

  return new Promise((resolve) => {
    let finished = false;
    const finish = (r) => { if (!finished) { finished = true; resolve(r); } };
    signal.addEventListener('abort', () => finish(null), { once: true });

    cards.forEach((card) => ctx.onTap(card, async () => {
      if (finished) return;
      const o = card._opt;
      const t = Date.now();
      if (!attempts.length) { msToFirstTap = promptEnd ? t - promptEnd : null; idleLevelBeforeFirstTap = ctx.idleLevel(); }
      attempts.push({ word: o.word, letter: o.letter, correct: o === target, msFromPromptEnd: promptEnd ? t - promptEnd : null, idleLevel: ctx.idleLevel() });

      if (o === target) {
        ctx.clearTarget();
        card.classList.add('right');
        ctx.sounds.tada();
        burst(card);
        await ctx.say(ctx.fill(line('findit.right'), vars));
        const firstTry = attempts.length === 1 && !hinted;
        finish({
          activity, target: { word: target.word, letter: target.letter },
          options: options.map((x, i) => ({ word: x.word, letter: x.letter, position: i })),
          attempts, firstTry, hinted, msToFirstTap, idleLevelBeforeFirstTap,
        });
        return;
      }

      // Wrong: name what was tapped, say its sound, point back. The right one glows brighter.
      wrongs++;
      card.classList.add('dim');
      bounce(card);
      ctx.sounds.pop();
      if (wrongs === 1) {
        correct.classList.add('glow-1');
        ctx.setTarget(correct);
        const tk = ctx.content.kid(o.letter);
        await ctx.say(ctx.fill(line('findit.wrong'), { tapped: o.word, Tapped: cap(o.word), tappedSound: tk ? tk.kidSound : o.word }));
      } else {
        await hint();
      }
      if (!finished) armIdle();
    }));

    (async () => {
      await ctx.say(ctx.fill(line('findit.ask')));
      promptEnd = Date.now();
      if (!finished && !attempts.length) armIdle();
    })();
  });
}
