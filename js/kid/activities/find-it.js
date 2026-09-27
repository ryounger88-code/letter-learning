// Beat 3: find it. Three pictures, one starting with the letter's sound. The target is one of
// the words just shown, never the anchor (the question says "like {anchor}"). See choice.js (K11).

import { askChoice } from '../choice.js';
import { pickDistractors } from '../distractors.js';

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

export default {
  id: 'find-it',
  stages: ['letters'],
  async run(ctx) {
    const shown = (ctx.shared.wordsShown || ctx.kid.words).slice(1);
    const pool = shown.length ? shown : ctx.kid.words.slice(1);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const target = { ...pick, letter: ctx.letter };
    const distractors = pickDistractors({
      content: ctx.content, progress: ctx.store.getProgress(ctx.learner.id), letter: ctx.letter, target,
    });
    const result = await askChoice(ctx, { target, options: shuffle([target, ...distractors]), activity: 'find-it' });
    if (!result) return null;
    ctx.log('findit.result', result);
    return { summary: { firstTry: result.firstTry, hinted: result.hinted, attempts: result.attempts.length } };
  },
};
