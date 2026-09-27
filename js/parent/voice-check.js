// Voice check: plays every line the app can speak, on the real device, so the speech can be
// tuned by ear. App lines come from js/voice.js; per-letter lines from content/kid-words.json
// and content/go-play.json. The voice chosen here is saved for this device.

import { esc, fill, learnerVars, joinOr, cap } from '../text.js';
import { VOICE, RATE, COLOR_NAMES } from '../voice.js';

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v]] : flatten(v, prefix + k + '.')));
}

export function renderVoiceCheck({ root, store, content, speech, back, learner }) {
  const fam = store.getFamily();
  const sample = content.kidReadyLetters()[0] || content.order[0];
  const k = content.kid(sample) || { kidSound: '', words: [] };
  const a = content.anchor(sample) || { word: '' };
  const sampleWord = (k.words[1] || a);
  const tapped = (content.kid(content.kidReadyLetters()[1]) || { words: [{ word: '' }], kidSound: '' });
  const vars = {
    ...learnerVars(learner), grownups: joinOr(fam.grownups), anchor: a.word, sound: k.kidSound,
    color: COLOR_NAMES[content.colorKey(sample)], word: sampleWord.word, Word: cap(sampleWord.word),
    tapped: tapped.words[0].word, Tapped: cap(tapped.words[0].word), tappedSound: tapped.kidSound,
    nextAnchor: (content.anchor(content.kidReadyLetters()[1]) || { word: '' }).word,
  };
  const lines = [];
  const play = (text, rate) => { lines.push({ text, rate }); return lines.length - 1; };
  const row = (label, text, rate) => `<div class="vc-row"><button class="btn btn-outline vc-play" type="button" data-play="${play(text, rate)}" aria-label="Play">▶</button><span class="vc-label">${esc(label)}</span><span class="vc-text">${esc(text)}</span></div>`;

  const voices = speech.voices();
  const current = speech.currentVoice();
  const appRows = flatten(VOICE).map(([key, t]) => row(key, fill(t, vars)));

  const letterBlocks = content.kidContentLetters().map((id) => {
    const kid = content.kid(id);
    const an = content.anchor(id);
    const lv = { ...vars, anchor: an.word, sound: kid.kidSound, color: COLOR_NAMES[content.colorKey(id)] };
    const gp = content.goPlayFor(id, learner);
    return `<section class="card vc-letter">
      <div class="vc-head"><span class="chip k-${content.colorKey(id)}">${esc(id.toUpperCase())}</span>
        <span class="pill">${kid.kidReady ? 'Switched on' : 'Not switched on'}</span></div>
      ${kid.flag ? `<p class="notice small">${esc(kid.flag)}</p>` : ''}
      ${row('bare sound (slower)', kid.kidSound, RATE.sound)}
      ${row('kid line', kid.kidSays)}
      ${kid.words.map((w) => row(`${w.picture} ${w.word}`, w.spoken ? fill(w.spoken, lv) : fill(VOICE.words.line, { ...lv, word: w.word, Word: cap(w.word) }))).join('')}
      ${row('find-it question', fill(VOICE.findit.ask, lv))}
      ${gp ? row(`go play ${gp.picture}`, fill(gp.spoken, lv)) : ''}
    </section>`;
  }).join('');

  root.innerHTML = `
    <div class="container ll-body">
      <button class="back" id="back" type="button">← Home</button>
      <span class="eyebrow">Voice check</span>
      <h1>Every line the app can say</h1>
      <p class="lede">Play these on the device the child uses, with the volume up. If a line sounds wrong, note which one; app lines live in <code>js/voice.js</code>, letter lines in <code>content/kid-words.json</code>. A letter goes live in kid mode once it's switched on there (<code>"kidReady": true</code>).</p>
      ${speech.supported ? '' : '<p class="notice">This browser has no speech. Kid mode needs it.</p>'}
      <section class="card ll-form">
        <div class="field"><label for="vc-voice">Voice on this device</label>
          <select class="select" id="vc-voice">
            <option value="">Automatic (${esc(current ? current.name : 'none found')})</option>
            ${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${fam.voiceURI === v.voiceURI ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)}</option>`).join('')}
          </select>
          <span class="hint">Enhanced or premium voices sound best. On iPad, download them in Settings → Accessibility → Spoken Content → Voices.</span></div>
        <div class="field"><label for="vc-try">Try any spelling</label>
          <div class="row"><input class="input" id="vc-try" value="${esc(k.kidSound)}" autocomplete="off">
          <button class="btn btn-primary" id="vc-try-go" type="button">▶ Normal</button>
          <button class="btn btn-outline" id="vc-try-slow" type="button">▶ Slow</button></div></div>
      </section>
      <h2>Letters</h2>
      ${letterBlocks}
      <h2>App lines</h2>
      <p class="small">Filled in with example words from the ${esc(sample.toUpperCase())} letter.</p>
      <section class="card">${appRows.join('')}</section>
    </div>`;

  const $ = (s) => root.querySelector(s);
  $('#back').onclick = back;
  $('#vc-voice').onchange = (e) => { store.saveFamily({ voiceURI: e.target.value || null }); speech.say('This is the voice the app will use.'); };
  $('#vc-try-go').onclick = () => speech.say($('#vc-try').value);
  $('#vc-try-slow').onclick = () => speech.say($('#vc-try').value, { rate: RATE.sound });
  root.querySelectorAll('[data-play]').forEach((b) => {
    b.onclick = () => { const l = lines[+b.dataset.play]; speech.say(l.text, l.rate ? { rate: l.rate } : {}); };
  });
}
