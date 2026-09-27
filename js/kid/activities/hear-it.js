// Beat 1: hear it. The letter fills the screen. Every tap plays its sound (tap 2 plays the kid
// line); after two taps the arrow appears and becomes the target.

import { h, roundButton } from '../ui.js';
import { line, RATE } from '../../voice.js';

export default {
  id: 'hear-it',
  stages: ['letters'],
  run(ctx) {
    const card = ctx.card(ctx.letter, { size: 'hero' });
    const next = roundButton('next', 'Next');
    next.classList.add('hidden');
    ctx.stage.replaceChildren(h('div', { class: 'hear' }, card, next));

    return new Promise((resolve) => {
      let taps = 0;
      let seq = 0;
      let arrowShown = false;
      let done = false;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      ctx.signal.addEventListener('abort', () => finish(null), { once: true });

      const armCard = () => ctx.arm([ctx.fill(line('hear.idle1')), ctx.fill(line('hear.idle2'))]);
      const armArrow = () => ctx.arm([line('arrow.idle1'), line('arrow.idle2')]);
      const showArrow = async () => {
        arrowShown = true;
        next.classList.remove('hidden');
        ctx.setTarget(next); // K2: one target at a time
        await ctx.say(line('arrow.show'));
        if (!done) armArrow();
      };

      ctx.onTap(card, async () => {
        const my = ++seq;
        taps++;
        ctx.squish(card);
        if (taps === 2) await ctx.say(ctx.kid.kidSays);
        else await ctx.say(ctx.kid.kidSound, { rate: RATE.sound });
        if (done || my !== seq) return; // a newer tap took over
        if (taps >= 2 && !arrowShown) await showArrow();
        else if (arrowShown) armArrow();
        else armCard();
      });
      ctx.onTap(next, () => { seq++; finish({ summary: { taps } }); });

      ctx.setTarget(card);
      (async () => {
        await ctx.say(ctx.fill(line('hear.arrive')));
        if (!done && taps === 0) armCard();
      })();
    });
  },
};
