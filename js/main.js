// Boot: open storage, load content and activities, then show parent mode or reopen kid mode.

import { createStore, localBackend, memoryBackend } from './storage.js';
import { fetchContent } from './content.js';
import { createSpeech } from './speech.js';
import { createSounds } from './sounds.js';
import { loadActivities, journeysForStage } from './kid/registry.js';
import { startKidMode } from './kid/kid.js';
import { createParent } from './parent/parent.js';
import { esc } from './text.js';

const parentRoot = document.getElementById('parent-root');
const kidRoot = document.getElementById('kid-root');

let store;
try { store = createStore({ backend: localBackend() }); } catch { store = createStore({ backend: memoryBackend() }); }

let updateReady = false;
function notices() {
  const n = [];
  if (!store.persistent) n.push({ html: '<b>This browser isn\'t saving anything.</b> Progress disappears when the page closes. Private browsing does this; open Letter Lab in a normal window, or install it.' });
  if (updateReady) n.push({ html: 'A new version of Letter Lab is ready. <button class="btn btn-outline" data-reload type="button">Reload</button>' });
  return n;
}

async function boot() {
  let content;
  try {
    content = await fetchContent('./');
    await loadActivities(content.plans, './');
  } catch (e) {
    parentRoot.innerHTML = `<div class="container ll-body"><h1>Letter Lab couldn't start</h1><p>${esc(e.message)}</p><p>Check the connection and reload.</p></div>`;
    parentRoot.hidden = false;
    return;
  }
  const speech = createSpeech({ getPreferredVoice: () => store.getFamily().voiceURI });
  const sounds = createSounds();
  const journeysFor = (stage) => journeysForStage(content.plans, stage);

  const parent = createParent({ root: parentRoot, store, content, speech, journeysFor, notices, onHandOff: (id) => enterKid(id) });

  // K16: the parent picks who is playing (one "Hand it to" button per child). Kid mode never shows a picker.
  function enterKid(learnerId) {
    const learner = store.getLearner(learnerId);
    if (!learner || !journeysFor(learner.stage).length) return; // K15: nothing for this stage, no kid mode
    store.saveFamily({ mode: 'kid', activeLearnerId: learnerId });
    parentRoot.hidden = true;
    document.documentElement.classList.add('in-kid');
    window.scrollTo(0, 0);
    startKidMode({
      root: kidRoot, store, content, speech, sounds, learner,
      onExit: () => {
        store.saveFamily({ mode: 'parent' });
        document.documentElement.classList.remove('in-kid');
        parent.go({ name: 'home' });
      },
    });
  }

  // K15: reopen straight into kid mode only if the active child's stage allows playing alone.
  const fam = store.getFamily();
  const active = store.getActiveLearner();
  const solo = active && (content.stages[active.stage] || {}).soloPlay && journeysFor(active.stage).length;
  if (fam.mode === 'kid' && solo) enterKid(active.id);
  else {
    if (fam.mode === 'kid') store.saveFamily({ mode: 'parent' });
    parent.render();
  }

  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('ll1:')) { store.reload(); if (!parentRoot.hidden) parent.render(); }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        updateReady = true; // parent mode offers a reload; kid mode picks it up next launch
        const box = document.getElementById('notices');
        if (box && !parentRoot.hidden) box.innerHTML = notices().map((n) => `<div class="notice">${n.html}</div>`).join('');
        document.querySelectorAll('[data-reload]').forEach((b) => { b.onclick = () => location.reload(); });
      }
      hadController = true;
    });
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker not registered', e));
  }
  store.requestPersist();
}

boot();
