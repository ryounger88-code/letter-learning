// Parent mode: the lesson guide ported from v1, plus first-run setup, the hand-off to kid mode,
// the install card, settings, and Voice check. Parent-editable settings live in the learner
// profile and family settings (storage.js), never in code.

import { esc, fillLearner, joinOr } from '../text.js';
import { RIDGE_SVG } from '../kid/ui.js';
import { renderVoiceCheck } from './voice-check.js';
import { installInfo } from './install.js';

const KIND = { warmup: 'Warm up', letter: 'Letter', build: 'Build', words: 'Words', bible: 'Bible', move: 'Move', wrapup: 'Wrap up' };
const RATINGS = { loved: 'Loved it', ok: 'Fine', hard: 'Too hard' };

export function createParent({ root, store, content, speech, journeysFor, onHandOff, notices }) {
  let view = { name: 'home' };
  const $ = (sel) => root.querySelector(sel);

  const learner = () => store.getActiveLearner();
  const T = (text) => esc(fillLearner(text, learner(), { grownups: joinOr(store.getFamily().grownups) }));
  const chip = (id, cls = '') => `<span class="chip k-${content.colorKey(id)} ${cls}">${esc(id.toUpperCase())}</span>`;

  function go(v) { view = v; render(); window.scrollTo(0, 0); }

  function render() {
    root.hidden = false;
    if (!store.getLearners().length) return renderSetup();
    if (view.name === 'lesson') return renderLesson(view.id);
    if (view.name === 'voice') return renderVoiceCheck({ root, store, content, speech, back: () => go({ name: 'home' }), learner: learner() });
    if (view.name === 'settings') return renderSettings();
    return renderHome();
  }

  // ---------------- first run ----------------
  function renderSetup(existing = null) {
    const L = existing || {};
    const fam = store.getFamily();
    const g = fam.grownups && fam.grownups.length ? fam.grownups : ['Mom', 'Dad'];
    root.innerHTML = `
      ${hero('Set up <span class="mark">Letter Lab</span>', 'Everything you type here stays on this device. It never goes into the app\'s code or anywhere online.')}
      <div class="container ll-body">
        <form class="card ll-form" id="setup">
          <span class="eyebrow">${existing ? 'Edit child' : 'First run'}</span>
          <h2>Who's learning?</h2>
          <div class="field"><label for="f-name">Child's first name</label>
            <input class="input" id="f-name" autocomplete="off" required maxlength="40" value="${esc(L.name || '')}"></div>
          <fieldset class="field"><legend>Pronoun, for the parent guide</legend>
            <div class="radios">
              ${['he', 'she', 'they'].map((p) => `<label><input type="radio" name="pronoun" value="${p}" ${L.pronoun === p ? 'checked' : ''} required> ${{ he: 'he / him', she: 'she / her', they: 'they / them' }[p]}</label>`).join('')}
            </div></fieldset>
          <div class="field"><label for="f-stage">Stage</label>
            <select class="select" id="f-stage">
              ${Object.entries(content.stages).map(([id, s]) => `<option value="${id}" ${(L.stage || 'letters') === id ? 'selected' : ''}>${esc(s.label)} (about ${s.ages[0]}–${s.ages[1]})</option>`).join('')}
            </select>
            <span class="hint">Letters is for this app's letter journey. Toddler has no activity yet.</span></div>
          <div class="field"><label for="f-g1">What does the child call the grown-ups?</label>
            <div class="grownups">
              ${[0, 1, 2].map((i) => `<input class="input" id="f-g${i + 1}" maxlength="20" placeholder="${i === 2 ? 'Optional' : ''}" value="${esc(g[i] || '')}">`).join('')}
            </div>
            <span class="hint">The app says these out loud: "Show it to ${esc(joinOr(g))}!"</span></div>
          <div class="row"><button class="btn btn-primary" type="submit">${existing ? 'Save' : 'Start'}</button>
          ${existing ? '<button class="btn btn-outline" type="button" id="cancel">Cancel</button>' : ''}</div>
        </form>
      </div>`;
    $('#setup').onsubmit = (e) => {
      e.preventDefault();
      const pronoun = (root.querySelector('input[name=pronoun]:checked') || {}).value;
      const name = $('#f-name').value.trim();
      if (!name || !pronoun) return;
      const saved = store.saveLearner({ ...(existing || {}), name, pronoun, stage: $('#f-stage').value });
      const grownups = [1, 2, 3].map((i) => $('#f-g' + i).value.trim()).filter(Boolean);
      store.saveFamily({ grownups, activeLearnerId: saved.id });
      store.requestPersist();
      go({ name: 'home' });
    };
    if (existing) $('#cancel').onclick = () => go({ name: 'settings' });
  }

  function hero(title, sub) {
    return `<header class="ll-hero"><div class="container">
      <div class="wordmark">Letter Lab</div>
      <h1>${title}</h1>
      <p class="lead">${sub}</p></div>${RIDGE_SVG}</header>`;
  }

  // ---------------- home ----------------
  function renderHome() {
    const L = learner();
    const sessions = store.getParentSessions(L.id);
    const order = content.order;
    const next = order.find((id) => content.lessonReady(id) && !sessions.some((s) => s.letterId === id))
      || order.find((id) => content.lessonReady(id) && sessions.some((s) => s.letterId === id && s.rating === 'hard'))
      || order.find((id) => content.lessonReady(id));
    const nextRuns = sessions.filter((s) => s.letterId === next);
    const why = nextRuns.length ? 'You logged this as tough last time — worth a second pass.'
      : sessions.length ? 'Next in the sequence.' : 'Nothing logged yet — start here.';
    const learners = store.getLearners();
    const handoffs = learners.filter((x) => journeysFor(x.stage).length);
    const inst = installInfo();

    root.innerHTML = `
      ${hero('One letter at a <span class="mark">time</span>', 'A build, a story, a sound, and something to move. Written for whoever is holding the marker, not the tablet.')}
      <div class="container ll-body">
        <div id="notices">${notices().map((n) => `<div class="notice">${n.html}</div>`).join('')}</div>

        <div class="nextup">
          ${chip(next, 'big')}
          <div class="b"><span class="eyebrow">Next up</span><strong>${esc(content.index[next].theme)}</strong><span class="why">${esc(why)}</span></div>
          <button class="btn btn-primary" id="nu-go" type="button">Open the lesson →</button>
        </div>

        <section class="card handoff">
          <span class="eyebrow">Kid mode</span>
          <div class="row">${handoffs.map((x) => `<button class="btn btn-primary btn-big" type="button" data-hand="${esc(x.id)}">Hand it to ${esc(x.name)}</button>`).join('')
            || '<p class="small">No kid activity exists yet for this child\'s stage.</p>'}</div>
          <p class="small">The app talks the whole way through. To get back here, <b>press and hold the top-right corner for three seconds</b>.</p>
          ${speech.supported ? '' : '<p class="notice">This browser can\'t speak, and kid mode needs speech. Try Safari or Chrome.</p>'}
        </section>

        ${inst.standalone ? '' : `<section class="card install" id="install">
          <span class="eyebrow">Install it</span>
          <h3>Add Letter Lab to the Home Screen</h3>
          <p>In a browser tab, Safari deletes this app's saved progress after 7 days without a visit. Installed to the Home Screen, it keeps it, runs full screen, and works offline.</p>
          <p class="steps-inline">${esc(inst.howTo)}</p>
          ${inst.canPrompt ? '<button class="btn btn-primary" id="install-go" type="button">Install</button>' : ''}
        </section>`}

        <section class="ll-section">
          <span class="eyebrow">Teaching order</span>
          <p class="lede">Not alphabetical. Letters come in by how often they appear in real words and how easy their sound is to stretch and blend — with <b>L</b> pulled to the front as a name letter, and <b>A</b> and <b>T</b> pulled forward so whole words are readable by week five.</p>
          <div class="track">${order.map((id) => `<b class="${sessions.some((s) => s.letterId === id) ? 'done' : ''}" title="${esc(content.index[id].theme)}">${esc(id.toUpperCase())}</b>`).join('')}</div>
          <div class="tiles">${order.map((id) => tile(id, sessions)).join('')}</div>
        </section>

        <section class="ll-section">
          <h2>What ${esc(L.name)}'s into right now</h2>
          <p class="lede">Keep this current. Future lesson suggestions will be built around it.</p>
          <div class="chips">${(L.interests || []).map((t, i) => `<span class="ichip">${esc(t)}<button type="button" data-i="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join('') || '<span class="small">Nothing listed yet.</span>'}</div>
          <form class="addrow" id="addchip"><input class="input" id="chipinput" placeholder="dinosaurs, garbage trucks, Bluey…" aria-label="Add an interest"><button class="btn btn-outline" type="submit">Add</button></form>
        </section>

        <section class="ll-section">
          <h2>Session log</h2>
          <p class="lede">Ratings are saved on this device. They're the record for deciding which letters get rebuilt and which activities get dropped.</p>
          ${logRows(sessions)}
        </section>

        <section class="ll-section">
          <h2>How a session runs</h2>
          <p class="lede">${T('Twenty to thirty minutes, once or twice a week. The blocks are in a deliberate order — sound, then shape, then build, then story — but if {child} is wiggly, jump to the movement block and come back. Nothing here breaks if you skip it. Stop while {child} still wants more; that\'s what makes {them} say yes next time.')}</p>
        </section>

        <section class="ll-section settings">
          <h2>Settings</h2>
          <p class="lede">${esc(L.name)} · ${esc(content.stages[L.stage] ? content.stages[L.stage].label : L.stage)} stage · about ${esc(L.sessionsPerWeek)} sessions a week · grown-ups: ${esc(joinOr(store.getFamily().grownups))}</p>
          <div class="row">
            <button class="btn btn-outline" id="to-settings" type="button">Edit settings</button>
            <button class="btn btn-outline" id="to-voice" type="button">Voice check</button>
          </div>
        </section>

        <footer class="ll-foot small">Letter sequence follows the standard research-based order rather than A–Z. Bible fragments are KJV or marked as paraphrase. Video links open a filtered YouTube search rather than a fixed video, so they don't rot — preview before handing over the tablet.</footer>
      </div>`;

    $('#nu-go').onclick = () => go({ name: 'lesson', id: next });
    root.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => go({ name: 'lesson', id: b.dataset.open }); });
    root.querySelectorAll('[data-hand]').forEach((b) => { b.onclick = () => onHandOff(b.dataset.hand); });
    root.querySelectorAll('.ichip button').forEach((b) => {
      b.onclick = () => { const x = learner(); const interests = (x.interests || []).filter((_, i) => i !== +b.dataset.i); store.saveLearner({ ...x, interests }); render(); };
    });
    $('#addchip').onsubmit = (e) => {
      e.preventDefault();
      const v = $('#chipinput').value.trim();
      const x = learner();
      if (v && !(x.interests || []).includes(v)) { store.saveLearner({ ...x, interests: [...(x.interests || []), v] }); render(); }
    };
    $('#to-settings').onclick = () => go({ name: 'settings' });
    $('#to-voice').onclick = () => go({ name: 'voice' });
    const ig = $('#install-go');
    if (ig) ig.onclick = async () => { await inst.prompt(); render(); };
    root.querySelectorAll('[data-reload]').forEach((b) => { b.onclick = () => location.reload(); });
  }

  function tile(id, sessions) {
    const m = content.index[id];
    if (!content.lessonReady(id)) {
      return `<div class="tile planned"><span class="chip plain">${esc(id.toUpperCase())}</span><span class="th">${esc(m.theme)}</span></div>`;
    }
    const runs = sessions.filter((s) => s.letterId === id);
    const last = runs[runs.length - 1];
    return `<button class="tile" type="button" data-open="${id}">${chip(id)}<span class="th">${esc(m.theme)}</span>
      <span class="pill">${last ? `<i class="${esc(last.rating)}"></i>${esc(RATINGS[last.rating] || 'Rated')}` : 'Not run yet'}</span></button>`;
  }

  function logRows(sessions) {
    if (!sessions.length) return '<div class="empty">No sessions logged yet. Run a letter, then rate it at the bottom of the lesson — three taps.</div>';
    const sorted = [...sessions].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return `<div class="logrows">${sorted.map((s) => `
      <div class="logrow">${chip(s.letterId)}
        <span class="pill"><i class="${esc(s.rating)}"></i>${esc(RATINGS[s.rating] || s.rating)}</span>
        <span class="small">${esc(s.date || '')}${s.teacher ? ' · ' + esc(s.teacher) : ''}</span>
        ${s.notes ? `<p class="n">${esc(s.notes)}</p>` : ''}
      </div>`).join('')}</div>`;
  }

  // ---------------- lesson ----------------
  function renderLesson(id) {
    const L = content.lessons[id];
    if (!L) return go({ name: 'home' });
    const me = learner();
    const runs = store.getParentSessions(me.id).filter((s) => s.letterId === id);
    const fam = store.getFamily();
    const teachers = [...(fam.grownups || []), 'Together'];
    root.innerHTML = `
      <div class="container ll-body lesson">
        <button class="back" id="back" type="button">← All letters</button>
        <header class="lhead">
          <span class="chip k-${content.colorKey(id)} hero-chip">${esc(L.letter)}${esc(L.letter.toLowerCase())}</span>
          <div class="meta">
            <span class="eyebrow">Letter ${esc(L.letter)} · ${esc(L.subject)}</span>
            <h1>${T(L.theme)}</h1>
            <div class="facts">
              <span><b>${L.estimatedMinutes} min</b> total</span>
              <span>Sound <b>${esc(L.sound.phoneme)}</b></span>
              <span>Math: <b>${esc(L.math.skill)}</b></span>
              ${runs.length ? `<span>Run <b>${runs.length}×</b></span>` : ''}
            </div>
          </div>
        </header>

        <div class="note"><b>Why this letter now.</b> ${T(L.whyThisOrder)}</div>

        <div class="cols two">
          <div class="card box"><h4>The sound</h4><p>${T(L.sound.cue)}</p><span class="say">${T(L.sound.sayThis)}</span><p><b>Watch for:</b> ${T(L.sound.commonConfusion)}</p></div>
          <div class="card box"><h4>Making the shape</h4>
            <p><b class="glyph">${esc(L.letter)}</b> — ${T(L.formation.capital)}</p>
            <p><b class="glyph">${esc(L.letter.toLowerCase())}</b> — ${T(L.formation.lowercase)}</p>
            <p class="small"><b>Ladder:</b> ${L.formation.practiceLadder.map(T).join(' → ')}</p></div>
          <div class="card box"><h4>Words to say out loud</h4><div class="wordrow">
            ${L.words.target.map((w) => `<span class="word">${T(w)}</span>`).join('')}
            ${L.words.stretch.map((w) => `<span class="word stretch">${T(w)}</span>`).join('')}</div></div>
          <div class="card box"><h4>Get out before you start</h4><ul>${L.materials.map((m) => `<li>${T(m)}</li>`).join('')}</ul></div>
        </div>

        <h2 class="blocks-title">The session</h2>
        <div class="blocks">
          ${L.blocks.map((b, i) => `
            <details class="card blk" ${i === 0 ? 'open' : ''}>
              <summary><span class="kind">${esc(KIND[b.type] || b.type)}</span><span class="ttl">${T(b.title)}</span><span class="mins">${b.minutes} min</span><span class="chev" aria-hidden="true">›</span></summary>
              <div class="inner">
                ${b.parentScript ? `<span class="say">${T(b.parentScript)}</span>` : ''}
                <ol class="ll-steps">${b.steps.map((s) => `<li>${T(s)}</li>`).join('')}</ol>
                ${b.brickCount ? `<p class="small">About ${b.brickCount} bricks.</p>` : ''}
                ${b.extension ? `<p><b>If ${T('{child}')} is still with you:</b> ${T(b.extension)}</p>` : ''}
              </div>
            </details>`).join('')}
        </div>

        <div class="cols two">
          <div class="card box"><h4>Bible in five minutes</h4><p><b>${esc(L.bible.passage)}</b> — ${T(L.bible.story)}</p><span class="say">${T(L.bible.memoryPhrase)}</span><p class="small">${T(L.bible.note)}</p></div>
          <div class="card box"><h4>Numbers hiding in here</h4><p><b>${T(L.math.skill)}</b></p><p>${T(L.math.how)}</p></div>
          <div class="card box"><h4>If it goes sideways</h4><ul>
            <li><b>Too hard:</b> ${T(L.adaptations.ifTooHard)}</li>
            <li><b>Too easy:</b> ${T(L.adaptations.ifTooEasy)}</li>
            <li><b>Too wiggly:</b> ${T(L.adaptations.ifWiggly)}</li></ul></div>
          <div class="card box"><h4>Books worth pulling</h4><ul>${L.books.map((b) => `<li><b>${esc(b.title)}</b> — ${T(b.why)}</li>`).join('')}</ul></div>
        </div>

        <div class="card box"><h4>Watch together (preview first)</h4><div class="media">
          ${L.media.map((m) => `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(m.query)}" target="_blank" rel="noopener"><span class="pl" aria-hidden="true">▶</span><span><span class="ml">${T(m.label)}</span><span class="mh">${T(m.channelHint)}</span></span></a>`).join('')}
        </div></div>

        <section class="card rate">
          <h3>How did it go?</h3>
          <p class="small">Three taps now saves you guessing in a month. This is what decides which letters get rebuilt and which activities get dropped.</p>
          <div class="rateopts">
            <button class="rateopt loved" data-r="loved" type="button" aria-pressed="false"><strong>Loved it</strong><span>Asked to keep going</span></button>
            <button class="rateopt fine" data-r="ok" type="button" aria-pressed="false"><strong>Fine</strong><span>Did it, moved on</span></button>
            <button class="rateopt hard" data-r="hard" type="button" aria-pressed="false"><strong>Too hard</strong><span>Frustrated or checked out</span></button>
          </div>
          <div class="field"><label for="teacher">Who ran it</label>
            <select class="select" id="teacher">${teachers.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
          <textarea class="textarea" id="notes" placeholder="${T('What landed? What flopped? Did {child} blend a word? — optional but this is the good stuff')}"></textarea>
          <button class="btn btn-primary" id="save" type="button" disabled>Save this session</button>
          <p class="savedmsg" id="saved" hidden>Saved.</p>
        </section>
      </div>`;

    let picked = null;
    root.querySelectorAll('.rateopt').forEach((b) => {
      b.onclick = () => {
        picked = b.dataset.r;
        root.querySelectorAll('.rateopt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        $('#save').disabled = false;
      };
    });
    $('#save').onclick = () => {
      $('#save').disabled = true;
      try {
        store.recordSession(me.id, { letterId: id, rating: picked, notes: $('#notes').value.trim(), teacher: $('#teacher').value });
        $('#saved').textContent = store.persistent ? 'Saved.' : 'Saved for now — this browser isn\'t keeping data, so it won\'t survive a reload.';
      } catch (e) {
        $('#saved').textContent = 'Couldn\'t save that one — storage may be full. Try again in a moment.';
        $('#save').disabled = false;
      }
      $('#saved').hidden = false;
    };
    $('#back').onclick = () => go({ name: 'home' });
  }

  // ---------------- settings ----------------
  function renderSettings() {
    const L = learner();
    const kb = Math.round(store.usageBytes() / 1024);
    root.innerHTML = `
      <div class="container ll-body">
        <button class="back" id="back" type="button">← Home</button>
        <h1>Settings</h1>
        <section class="card ll-form">
          <span class="eyebrow">Child</span>
          <h3>${esc(L.name)}</h3>
          <p class="small">${esc({ he: 'he / him', she: 'she / her', they: 'they / them' }[L.pronoun])} · ${esc(content.stages[L.stage] ? content.stages[L.stage].label : L.stage)} stage</p>
          <button class="btn btn-outline" id="edit" type="button">Edit name, pronoun, stage and grown-ups</button>
          <div class="field"><label for="spw">Sessions a week, roughly</label>
            <input class="input narrow" id="spw" type="number" min="1" max="14" value="${esc(L.sessionsPerWeek)}">
            <span class="hint">Used later to space out review. Nothing uses it yet.</span></div>
          <button class="btn btn-primary" id="save-spw" type="button">Save</button>
        </section>
        <section class="card ll-form">
          <span class="eyebrow">This device</span>
          <p>Progress saved here: about ${kb} KB. ${store.persistent ? '' : '<b>This browser isn\'t keeping data between visits.</b>'}</p>
          <p class="small">Progress lives only on this device for now. Saving and loading a progress file, and syncing between devices, come later.</p>
        </section>
      </div>`;
    $('#back').onclick = () => go({ name: 'home' });
    $('#edit').onclick = () => renderSetup(L);
    $('#save-spw').onclick = () => {
      const n = Math.max(1, Math.min(14, parseInt($('#spw').value, 10) || 4));
      store.saveLearner({ ...learner(), sessionsPerWeek: n });
      go({ name: 'home' });
    };
  }

  return { render, go };
}
