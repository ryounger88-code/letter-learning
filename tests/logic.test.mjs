// Storage, what-comes-next, distractors and text filling: the logic that doesn't need a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStore, memoryBackend, localBackend } from '../js/storage.js';
import { makeContent } from '../js/content.js';
import { chooseNext } from '../js/choose-next.js';
import { pickDistractors } from '../js/kid/distractors.js';
import { fillLearner, joinOr } from '../js/text.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL('../content/' + p, import.meta.url), 'utf8'));
const raw = () => ({
  curriculum: read('curriculum.json'), kid: read('kid-words.json'), goPlay: read('go-play.json'),
  stages: read('stages.json'), sounds: read('letter-sounds.json'), plans: read('plans.json'),
});
const content = makeContent(raw());

function fakeLocalStorage() {
  const m = new Map();
  return {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
  };
}

test('learner profiles default to the letters stage and four sessions a week', () => {
  const s = createStore({ backend: memoryBackend() });
  const l = s.saveLearner({ name: 'Kid', pronoun: 'she' });
  assert.equal(l.stage, 'letters');
  assert.equal(l.sessionsPerWeek, 4);
  assert.deepEqual(l.interests, []);
  const l2 = s.saveLearner({ name: 'Baby', pronoun: 'he', stage: 'toddler' });
  assert.equal(s.getLearners().length, 2, 'nothing assumes there is only one learner');
  assert.equal(s.getLearner(l2.id).stage, 'toddler');
});

test('events are append-only, per learner and per letter, and carry learner and device ids', () => {
  const ls = fakeLocalStorage();
  const s = createStore({ backend: localBackend(ls) });
  const a = s.saveLearner({ name: 'A', pronoun: 'he' });
  const b = s.saveLearner({ name: 'B', pronoun: 'she' });
  s.recordLetterVisit(a.id, 'l');
  s.recordEvent({ learnerId: a.id, type: 'letter.star', letter: 'l' });
  s.recordEvent({ learnerId: b.id, type: 'letter.open', letter: 'm' });
  s.recordEvent({ learnerId: a.id, type: 'session.start' });
  const keys = [...Array(ls.length).keys()].map((i) => ls.key(i)).filter((k) => k.startsWith('ll1:ev:'));
  assert.deepEqual(keys.sort(), [`ll1:ev:${a.id}:_`, `ll1:ev:${a.id}:l`, `ll1:ev:${b.id}:m`].sort());
  const ev = s.getEvents(a.id);
  assert.equal(ev.length, 3);
  assert.ok(ev.every((e) => e.learnerId === a.id && e.deviceId === s.deviceId && e.id && e.at));
  assert.throws(() => s.recordEvent({ type: 'letter.open', letter: 'l' }), /learnerId/);
  assert.throws(() => s.recordEvent({ learnerId: a.id, type: 'made.up' }), /Unknown event type/);
});

test('progress is derived from the log, and logs merge without duplicates', () => {
  const s = createStore({ backend: memoryBackend() });
  const k = s.saveLearner({ name: 'K', pronoun: 'they' });
  s.recordLetterVisit(k.id, 'l');
  s.recordFindItResult(k.id, 'l', { firstTry: true, attempts: [{ word: 'leaf', correct: true }] });
  s.recordEvent({ learnerId: k.id, type: 'letter.star', letter: 'l' });
  let p = s.getProgress(k.id);
  assert.equal(p.letters.l.opens, 1);
  assert.equal(p.letters.l.stars, 1);
  assert.equal(p.letters.l.findIt.firstTry, 1);
  // Another device's log: one event we already have, one new.
  const other = createStore({ backend: memoryBackend() });
  const theirs = other.recordEvent({ learnerId: k.id, type: 'letter.star', letter: 'm' });
  const added = s.mergeEvents([...s.getEvents(k.id), theirs, theirs]);
  assert.equal(added, 1);
  p = s.getProgress(k.id);
  assert.equal(p.stars.length, 2);
});

test('chooseNext: first unfinished letter in teaching order, then least recently played', () => {
  const learner = { stage: 'letters', sessionsPerWeek: 4 };
  const none = { letters: {} };
  assert.deepEqual(chooseNext(learner, none, content), { letter: 'l', reason: 'first-unfinished' });
  const lDone = { letters: { l: { stars: 1, lastPlayed: '2026-09-27T10:00:00Z' } } };
  assert.equal(chooseNext(learner, lDone, content).letter, 'm');
  assert.equal(chooseNext(learner, none, content, { exclude: 'l' }).letter, 'm');
  const allDone = { letters: {
    l: { stars: 1, lastPlayed: '2026-09-27T10:00:00Z' }, m: { stars: 1, lastPlayed: '2026-09-25T10:00:00Z' },
    s: { stars: 2, lastPlayed: '2026-09-26T10:00:00Z' }, a: { stars: 1, lastPlayed: '2026-09-27T11:00:00Z' },
  } };
  assert.deepEqual(chooseNext(learner, allDone, content), { letter: 'm', reason: 'least-recent' });
});

test('distractors never share the target letter or its sound, and prefer finished letters', () => {
  const target = { word: 'leaf', picture: '🍃', letter: 'l' };
  for (let i = 0; i < 50; i++) {
    const ds = pickDistractors({ content, progress: { letters: {} }, letter: 'l', target });
    assert.equal(ds.length, 2);
    assert.ok(ds.every((d) => d.letter !== 'l' && d.word[0] !== 'l' && d.picture !== '🍃'));
    assert.notEqual(ds[0].letter, ds[1].letter);
  }
  const progress = { letters: { s: { stars: 1 }, a: { stars: 1 } } };
  for (let i = 0; i < 20; i++) {
    const ds = pickDistractors({ content, progress, letter: 'l', target });
    assert.deepEqual(ds.map((d) => d.letter).sort(), ['a', 's']);
  }
  // Same-sound letters (c and k) are never distractors for each other.
  const ck = makeContent({ ...raw(), kid: { schema: 'letterlab-kid-1', letters: {
    c: { kidReady: true, kidSound: 'k', kidSays: 'x', words: [{ word: 'cat', picture: '🐱' }, { word: 'cup', picture: '☕' }, { word: 'car', picture: '🚗' }, { word: 'cow', picture: '🐄' }] },
    k: { kidReady: true, kidSound: 'k', kidSays: 'x', words: [{ word: 'kite', picture: '🪁' }, { word: 'key', picture: '🔑' }, { word: 'koala', picture: '🐨' }, { word: 'king', picture: '🤴' }] },
    m: { kidReady: true, kidSound: 'mmm', kidSays: 'x', words: [{ word: 'moon', picture: '🌙' }, { word: 'mouse', picture: '🐭' }, { word: 'milk', picture: '🥛' }, { word: 'monkey', picture: '🐒' }] },
  } } });
  for (let i = 0; i < 30; i++) {
    const ds = pickDistractors({ content: ck, progress: { letters: {} }, letter: 'k', target: { word: 'kite', picture: '🪁', letter: 'k' } });
    assert.ok(ds.every((d) => d.letter !== 'c'), 'c is never a distractor for k');
  }
});

test('placeholders fill from the learner profile and family labels', () => {
  const he = { name: 'Sam', pronoun: 'he' };
  const they = { name: 'Rio', pronoun: 'they' };
  assert.equal(fillLearner('Let {them} try it {themself}; it is {their} turn. {CHILD}', he), 'Let him try it himself; it is his turn. SAM');
  assert.equal(fillLearner('Let {them} try it {themself}.', they), 'Let them try it themselves.');
  assert.equal(fillLearner('Show {grownups}!', he, { grownups: joinOr(['Mom', 'Dad']) }), 'Show Mom or Dad!');
  assert.equal(joinOr([]), 'a grown-up');
  assert.equal(joinOr(['Mom', 'Dad', 'Nana']), 'Mom, Dad or Nana');
});
