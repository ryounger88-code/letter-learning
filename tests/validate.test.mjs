// The validator must pass the real content and fail loudly on the known traps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateRepo, validateKidWords, validateGoPlay, spokenProblems, isSingleEmoji } from '../tools/validate.mjs';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const kidSchema = read('../schema/kid-words.schema.json');
const gpSchema = read('../schema/go-play.schema.json');
const has = (errors, re) => errors.some((e) => re.test(e));

test('the repo content passes', async () => {
  const r = await validateRepo();
  assert.deepEqual(r.errors, []);
});

test('kid words: every trap is caught', () => {
  const { errors } = validateKidWords(read('./fixtures/bad-kid-words.json'), kidSchema);
  assert.ok(has(errors, /"l" kidSound has a slash/), 'slash in kidSound');
  assert.ok(has(errors, /"l" kidSays says the letter "L"/), 'letter name in kidSays');
  assert.ok(has(errors, /"lion" spoken says the letter "L"/), 'letter name in a word line');
  assert.ok(has(errors, /"leaf" picture must be exactly one emoji/), 'two emoji');
  assert.ok(has(errors, /"lamp" has no picture/), 'missing picture');
  assert.ok(has(errors, /\.words\[3\]\.word: "Log" doesn't match/), 'capitalised word');
  assert.ok(has(errors, /"m" kidSays has a digit/), 'digit');
  assert.ok(has(errors, /"moon" reuses the emoji 🦁/), 'reused emoji');
  assert.ok(has(errors, /"sun" doesn't start with m/), 'word under the wrong letter');
  assert.ok(has(errors, /letters\.m\.words: needs at least 4 items/), 'too few words');
});

test('go-play: every safety rule is enforced', () => {
  const { errors } = validateGoPlay(read('./fixtures/bad-go-play.json'), gpSchema);
  assert.ok(has(errors, /"outside-alone" .*outside needs supervision "grown-up"/), 'outside alone');
  assert.ok(has(errors, /"outside-alone" .*isn't tagged "outside"/), 'untagged hazard');
  assert.ok(has(errors, /"water-unsaid" water: the spoken line must say it's with a grown-up/), 'water, supervision not said');
  assert.ok(has(errors, /"toddler-doh" toddler prompt names a small object or Play-Doh/), 'toddler Play-Doh');
  assert.ok(has(errors, /"toddler-doh" toddler prompt is tagged "playdoh"/), 'toddler playdoh tag');
  assert.ok(has(errors, /"toddler-lego" toddler prompt names a small object/), 'toddler Lego');
  assert.ok(has(errors, /"eat" involves eating/), 'eating');
  assert.ok(has(errors, /"stranger" mentions strangers/), 'strangers');
  assert.ok(has(errors, /"named-mom" names a grown-up/), 'Mom typed into content');
  assert.ok(has(errors, /"bad-placeholder" unknown placeholder \{dad\}/), 'unknown placeholder');
});

test('go-play: safe prompts pass, including Duplo-size play for a toddler', () => {
  const { errors } = validateGoPlay(read('./fixtures/good-go-play.json'), gpSchema);
  assert.deepEqual(errors, []);
});

test('spoken text rules', () => {
  assert.deepEqual(spokenProblems('Tap a letter!'), []);
  assert.deepEqual(spokenProblems('A lion roars.'), []);
  assert.deepEqual(spokenProblems('Which one starts with {sound}? Like {anchor}!'), []);
  assert.ok(spokenProblems('Apple starts with A.').length);
  assert.ok(spokenProblems('This is L.').length);
  assert.ok(spokenProblems('/l/ /l/ lion').length);
  assert.ok(isSingleEmoji('☀️') && isSingleEmoji('🧑‍🚀') && !isSingleEmoji('🍃🍂') && !isSingleEmoji('a'));
});
