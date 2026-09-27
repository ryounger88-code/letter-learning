// Beat 4: star. A celebration, then the star flies into the strip at the top: the child's
// running record. Moves on by itself; timers, never animation events (K13).

import { h, ICONS, flash } from '../ui.js';
import { line } from '../../voice.js';

export default {
  id: 'star',
  stages: ['letters'],
  async run(ctx) {
    const star = h('button', { type: 'button', class: `big-star s-${ctx.colorKey}`, 'aria-label': 'Star', html: ICONS.star });
    ctx.stage.replaceChildren(h('div', { class: 'star-wrap' }, star));
    ctx.onTap(star, () => { flash(star, 'twinkle', 700); ctx.sounds.twinkle(); });
    ctx.sounds.tada();
    const talk = ctx.say(ctx.fill(line('star.done')));
    await ctx.wait(1000);
    if (ctx.signal.aborted) return null;
    const s = ctx.strip.getBoundingClientRect();
    const b = star.getBoundingClientRect();
    star.style.setProperty('--dx', `${s.left + s.width / 2 - (b.left + b.width / 2)}px`);
    star.style.setProperty('--dy', `${s.top + s.height / 2 - (b.top + b.height / 2)}px`);
    star.classList.add('fly');
    ctx.log('letter.star');
    await ctx.wait(750);
    ctx.renderStrip();
    const last = ctx.strip.querySelector('.star:last-child');
    if (last) flash(last, 'twinkle', 900);
    await talk;
    return { summary: {} };
  },
};
