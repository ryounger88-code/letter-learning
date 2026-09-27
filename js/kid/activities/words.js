// Beat 2: words. One picture at a time with its word underneath; the first letter sits on a chip
// of the letter's colour. The line plays on arrival; tapping the picture or word replays it.
// The arrow appears once the line has finished. Four words: the anchor first, then three others
// that rotate between visits when a letter has more than four.

import { h, roundButton } from '../ui.js';
import { line } from '../../voice.js';
import { cap } from '../../text.js';

function pickWords(ctx) {
  const all = ctx.kid.words;
  const others = all.slice(1);
  const opens = ((ctx.store.getProgress(ctx.learner.id).letters[ctx.letter] || {}).opens) || 1;
  const start = others.length ? (opens - 1) % others.length : 0;
  return [all[0], ...others.slice(start).concat(others.slice(0, start)).slice(0, 3)];
}

export default {
  id: 'words',
  stages: ['letters'],
  run(ctx) {
    const words = pickWords(ctx);
    ctx.shared.wordsShown = words;

    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      ctx.signal.addEventListener('abort', () => finish(null), { once: true });

      const show = (idx) => {
        const w = words[idx];
        const pic = h('button', { type: 'button', class: 'word-pic', 'aria-label': w.word }, h('span', { class: 'pic' }, w.picture));
        const text = h('button', { type: 'button', class: 'word-text', 'aria-label': w.word },
          h('span', { class: `fl k-${ctx.colorKey}` }, w.word[0]), w.word.slice(1));
        const next = roundButton('next', 'Next');
        next.classList.add('hidden');
        ctx.stage.replaceChildren(h('div', { class: 'words' }, h('div', { class: 'word-card' }, pic, text), next));

        const spoken = w.spoken ? ctx.fill(w.spoken) : ctx.fill(line('words.line'), { word: w.word, Word: cap(w.word) });
        let seq = 0;
        let arrowShown = false;
        const armArrow = () => ctx.arm([line('arrow.idle1'), line('words.idle2')]);
        const play = async () => {
          const my = ++seq;
          ctx.squish(pic);
          await ctx.say(spoken);
          if (done || my !== seq) return;
          if (!arrowShown) {
            arrowShown = true;
            next.classList.remove('hidden');
            ctx.setTarget(next);
          }
          armArrow();
        };
        ctx.onTap(pic, play);
        ctx.onTap(text, play);
        ctx.onTap(next, () => {
          seq++;
          if (idx + 1 < words.length) show(idx + 1);
          else finish({ summary: { words: words.map((x) => x.word) } });
        });
        ctx.setTarget(pic);
        play();
      };
      show(0);
    });
  },
};
