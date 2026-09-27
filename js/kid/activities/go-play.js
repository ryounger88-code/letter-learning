// Beat 5: go play. A spoken prompt tied to the letter sends the child off the screen for
// something hands-on, with a big picture and a big check to tap when done. It never blocks:
// "again" and the next letter's card are on the same screen, so skipping is one tap.
//
// K3a (named exception to K3): the prompt is said once, repeated once at ~30s, then the screen
// stays quiet, because the child is meant to walk away from it.
// Prompts come from content/go-play.json, checked for safety by tools/validate.mjs.
// "{grownups}" is filled from family setup, never from content.

import { h, roundButton, burst } from '../ui.js';
import { line } from '../../voice.js';

export default {
  id: 'go-play',
  stages: ['letters'],
  run(ctx) {
    const prompt = ctx.content.goPlayFor(ctx.letter, ctx.learner);
    const suggestion = ctx.suggestNext();
    const again = roundButton('again', 'Play again');
    const nextCard = suggestion ? ctx.card(suggestion.letter, { size: 'medium' }) : null;
    const check = prompt ? roundButton('check', 'Done') : null;
    const pic = prompt ? h('button', { type: 'button', class: 'gp-pic', 'aria-label': 'Picture' }, h('span', { class: 'pic' }, prompt.picture)) : null;
    ctx.stage.replaceChildren(h('div', { class: 'goplay' },
      prompt ? h('div', { class: 'gp-main' }, pic, check) : null,
      h('div', { class: 'gp-choices' }, again, nextCard)));

    return new Promise((resolve) => {
      let finished = false;
      let didIt = false;
      let seq = 0;
      const finish = (r) => { if (!finished) { finished = true; resolve(r); } };
      ctx.signal.addEventListener('abort', () => finish(null), { once: true });
      const promptText = prompt ? ctx.fill(prompt.spoken) : '';

      const choose = async () => {
        const my = ++seq;
        if (nextCard) {
          const nextVars = { nextAnchor: (ctx.content.anchor(suggestion.letter) || {}).word || '' };
          ctx.setTarget(nextCard);
          await ctx.say(ctx.fill(line('goplay.next'), nextVars));
          if (my !== seq || finished) return;
          ctx.setTarget(again);
          await ctx.say(line('goplay.again'));
          if (my !== seq || finished) return;
          ctx.setTarget(nextCard);
          ctx.arm([ctx.fill(line('goplay.next'), nextVars), ctx.fill(line('goplay.nextIdle2'), nextVars)]);
        } else {
          ctx.setTarget(again);
          await ctx.say(line('goplay.onlyAgain'));
          if (my !== seq || finished) return;
          ctx.arm([line('goplay.onlyAgain'), line('goplay.onlyAgain')]);
        }
      };
      const leave = (next) => {
        seq++;
        if (prompt && !didIt) ctx.log('goplay.skipped', { promptId: prompt.id });
        finish({ next, summary: { promptId: prompt && prompt.id, done: didIt } });
      };

      ctx.onTap(again, () => leave({ kind: 'again' }));
      if (nextCard) ctx.onTap(nextCard, () => leave({ kind: 'letter', letter: suggestion.letter }));

      if (!prompt) { choose(); return; }
      ctx.log('goplay.shown', { promptId: prompt.id, supervision: prompt.supervision });
      ctx.onTap(pic, async () => {
        const my = ++seq;
        ctx.squish(pic);
        await ctx.say(promptText);
        if (my === seq && !didIt && !finished) ctx.arm([promptText], 'goplay');
      });
      ctx.onTap(check, async () => {
        if (didIt) { choose(); return; }
        didIt = true;
        seq++;
        ctx.log('goplay.done', { promptId: prompt.id });
        ctx.sounds.tada();
        burst(check);
        check.classList.add('done');
        await ctx.say(line('goplay.done'));
        if (!finished) choose();
      });

      ctx.setTarget(check);
      (async () => {
        const my = ++seq;
        await ctx.say(promptText);
        if (my === seq && !didIt && !finished) ctx.arm([promptText], 'goplay'); // K3a
      })();
    });
  },
};
