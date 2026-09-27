#!/usr/bin/env node
// Content validator. Runs locally and in CI:
//
//   node tools/validate.mjs                        check the repo's content/ and js/voice.js
//   node tools/validate.mjs --kid incoming.json    check an incoming kid-words file (e.g. from Astra)
//   node tools/validate.mjs --goplay incoming.json check an incoming go-play file
//
// Exits 1 on any error. Warnings (flags, missing prompts) print but don't fail.
//
// v1 checks: schema shape; one emoji per picture and no emoji reused; spoken text has no letter
// names, slashes or digits; go-play safety rules. The phonetic checks (first sound of each word
// against a pronouncing dictionary: "sheep" under S, "arm" under A) come in v1.1.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.resolve(ROOT, p), 'utf8'));

// ---------- a small JSON Schema checker (the subset schema/*.json uses) ----------
export function checkSchema(schema, value, at = '$', out = []) {
  const type = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  const is = (t, v) => t === type(v) || (t === 'number' && typeof v === 'number');
  if (schema.const !== undefined && value !== schema.const) out.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) out.push(`${at}: must be one of ${schema.enum.join(', ')}`);
  if (schema.type) {
    const ts = [].concat(schema.type);
    if (!ts.some((t) => is(t, value))) { out.push(`${at}: must be ${ts.join(' or ')}`); return out; }
  }
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) out.push(`${at}: too short`);
    if (schema.maxLength != null && value.length > schema.maxLength) out.push(`${at}: too long (max ${schema.maxLength})`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${at}: "${value}" doesn't match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) out.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) out.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) out.push(`${at}: needs at least ${schema.minItems} items (has ${value.length})`);
    if (schema.maxItems != null && value.length > schema.maxItems) out.push(`${at}: at most ${schema.maxItems} items (has ${value.length})`);
    if (schema.items) value.forEach((v, i) => checkSchema(schema.items, v, `${at}[${i}]`, out));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) out.push(`${at}: missing "${k}"`);
    for (const [k, v] of Object.entries(value)) {
      const p = schema.properties && schema.properties[k];
      const pp = schema.patternProperties && Object.entries(schema.patternProperties).find(([re]) => new RegExp(re).test(k));
      if (p) checkSchema(p, v, `${at}.${k}`, out);
      else if (pp) checkSchema(pp[1], v, `${at}.${k}`, out);
      else if (schema.additionalProperties === false) out.push(`${at}: unexpected key "${k}"`);
    }
  }
  return out;
}

// ---------- spoken text ----------
const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
export function isSingleEmoji(s) {
  const g = [...seg.segment(String(s))];
  return g.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g[0].segment);
}

/** Problems in a line meant to be spoken: slashes, digits, a letter standing alone ("starts with L"). */
export function spokenProblems(text) {
  const out = [];
  const t = String(text).replace(/\{[A-Za-z]+\}/g, 'x-placeholder');
  if (t.includes('/')) out.push('has a slash (read aloud as "slash")');
  if (/\d/.test(t)) out.push('has a digit');
  const re = /(^|[^A-Za-z'’-])([A-Za-z])(?=[^A-Za-z'’-]|$)/g;
  let m;
  while ((m = re.exec(t))) {
    const letter = m[2];
    const rest = t.slice(m.index + m[0].length);
    const articleOrI = (letter === 'a' || letter === 'A' || letter === 'I') && /^\s+[A-Za-z]/.test(rest);
    if (!articleOrI) out.push(`says the letter "${letter}" on its own (the app never says letter names)`);
  }
  return out;
}

// ---------- go-play safety ----------
export const HAZARDS = {
  outside: /\b(outside|outdoors|yard|backyard|garden|park|street|road|driveway|sidewalk|woods|forest|beach|playground)\b/i,
  water: /\b(water|bath|bathtub|tub|sink|pool|pond|lake|river|creek|puddles?|hose|faucet|splash)\b/i,
  kitchen: /\b(kitchen|stove|oven|microwave|knife|knives|cook|cooking|bake|baking|pan|pot|kettle|toaster)\b/i,
  climbing: /\b(climb|climbing|ladder|stairs|staircase|step ?stool|counter|shelf|shelves|bunk)\b/i,
  tools: /\b(tool|tools|hammer|saw|screwdriver|drill|nails?|scissors|glue gun|needles?)\b/i,
};
export const SMALL_OBJECTS = /\b(legos?|beads?|coins?|buttons?|marbles?|play-?doh|playdough|clay|balloons?|beans?|rice|pasta|macaroni|batter(y|ies)|magnets?|grapes?|nuts?|popcorn|candy|candies|pebbles?|rocks?|stones?|small)\b/i;
export const BANNED = [
  [/\b(strangers?|someone you don'?t know|a person you don'?t know|neighbou?r'?s)\b/i, 'mentions strangers or other people\'s homes'],
  [/\b(leave the house|go outside by yourself|go out by yourself|by yourself outside|alone outside|walk to the)\b/i, 'sends the child out of the house alone'],
  [/\b(eat|eats|eating|taste|tasting|lick|licking|swallow|chew|chewing|drink|drinking)\b/i, 'involves eating or tasting'],
  [/\b(mom|mommy|mama|mum|dad|daddy|papa|grandma|grandpa|granny|nana|grammy|auntie|aunt|uncle)\b/i, 'names a grown-up; use {grownups}, which comes from family setup'],
];
const GROWNUP_SAID = /\b(with|ask|and)\s+(\{grownups\}|a grown-?up|your grown-?up)/i;

export function goPlayProblems(p) {
  const out = [];
  const text = p.spoken || '';
  const tags = new Set(p.tags || []);
  for (const [cat, re] of Object.entries(HAZARDS)) {
    const hit = re.test(text) || tags.has(cat);
    if (!hit) continue;
    if (!tags.has(cat)) out.push(`mentions ${cat} (${text.match(re)[0]}) but isn't tagged "${cat}"`);
    if (p.supervision !== 'grown-up') out.push(`${cat} needs supervision "grown-up"`);
    if (!GROWNUP_SAID.test(text)) out.push(`${cat}: the spoken line must say it's with a grown-up ("with {grownups}")`);
  }
  const toddler = (p.stages || []).includes('toddler') || (Array.isArray(p.ages) && p.ages[0] < 3);
  if (toddler) {
    const m = text.match(SMALL_OBJECTS);
    if (m) out.push(`toddler prompt names a small object or Play-Doh ("${m[0]}"): choking or mouthing hazard under three`);
    for (const t of ['small-objects', 'playdoh']) if (tags.has(t)) out.push(`toddler prompt is tagged "${t}"`);
  }
  for (const [re, why] of BANNED) if (re.test(text)) out.push(why);
  const unknown = (text.match(/\{[A-Za-z]+\}/g) || []).filter((x) => !['{grownups}', '{child}'].includes(x));
  if (unknown.length) out.push(`unknown placeholder ${unknown.join(', ')}`);
  if (!isSingleEmoji(p.picture)) out.push(`picture must be exactly one emoji ("${p.picture}")`);
  out.push(...spokenProblems(text).map((s) => 'spoken ' + s));
  return out;
}

// ---------- files ----------
export function validateKidWords(kid, schema) {
  const errors = checkSchema(schema, kid).map((e) => 'kid-words ' + e);
  const warnings = [];
  const pictures = new Map();
  const words = new Map();
  for (const [L, entry] of Object.entries((kid && kid.letters) || {})) {
    const where = `kid-words "${L}"`;
    for (const [field, text] of [['kidSound', entry.kidSound], ['kidSays', entry.kidSays]]) {
      if (text) spokenProblems(text).forEach((p) => errors.push(`${where} ${field} ${p}`));
    }
    if (entry.kidSound && !/^[A-Za-z ,.!'’-]+$/.test(entry.kidSound)) errors.push(`${where} kidSound should be letters only ("${entry.kidSound}")`);
    if (entry.flag) warnings.push(`${where} flagged: ${entry.flag}`);
    if (L === 'x' && !entry.note) warnings.push(`${where} needs a "note": X is taught as an ending sound (fox, box)`);
    for (const w of entry.words || []) {
      const ww = `${where} word "${w.word}"`;
      if (!w.picture) errors.push(`${ww} has no picture`);
      else if (!isSingleEmoji(w.picture)) errors.push(`${ww} picture must be exactly one emoji ("${w.picture}")`);
      if (L === 'x') { if (!/x$/.test(w.word)) errors.push(`${ww} should end in x`); }
      else if (L === 'q') { if (!/^qu/.test(w.word)) errors.push(`${ww} should start with qu`); }
      else if (w.word && w.word[0] !== L) errors.push(`${ww} doesn't start with ${L}`);
      if (w.picture) {
        if (pictures.has(w.picture)) errors.push(`${ww} reuses the emoji ${w.picture} (also "${pictures.get(w.picture)}")`);
        pictures.set(w.picture, w.word);
      }
      if (words.has(w.word)) errors.push(`${ww} appears twice (also under "${words.get(w.word)}")`);
      words.set(w.word, L);
      if (w.spoken) {
        spokenProblems(w.spoken).forEach((p) => errors.push(`${ww} spoken ${p}`));
        if (!w.spoken.toLowerCase().includes(w.word)) warnings.push(`${ww} spoken line doesn't include the word`);
      }
      if (w.flag) warnings.push(`${ww} flagged: ${w.flag}`);
    }
  }
  return { errors, warnings };
}

export function validateGoPlay(gp, schema, kid) {
  const errors = checkSchema(schema, gp).map((e) => 'go-play ' + e);
  const warnings = [];
  const ids = new Set();
  for (const p of (gp && gp.prompts) || []) {
    const where = `go-play "${p.id}"`;
    if (ids.has(p.id)) errors.push(`${where} id used twice`);
    ids.add(p.id);
    goPlayProblems(p).forEach((e) => errors.push(`${where} ${e}`));
    if (p.flag) warnings.push(`${where} flagged: ${p.flag}`);
  }
  if (kid) {
    for (const [L, e] of Object.entries(kid.letters || {})) {
      if (e.kidReady && !(gp.prompts || []).some((p) => p.letter === L && (p.stages || []).includes('letters'))) warnings.push(`letter "${L}" is switched on but has no go-play prompt`);
    }
  }
  return { errors, warnings };
}

export function validateCurriculum(cur) {
  const errors = [];
  const allowed = new Set(['{child}', '{CHILD}', '{them}', '{their}', '{themself}', '{Their}']);
  const walk = (o, at) => {
    if (typeof o === 'string') { for (const t of o.match(/\{[A-Za-z]+\}/g) || []) if (!allowed.has(t)) errors.push(`curriculum ${at}: unknown placeholder ${t}`); }
    else if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${at}[${i}]`));
    else if (o && typeof o === 'object') Object.entries(o).forEach(([k, v]) => walk(v, `${at}.${k}`));
  };
  walk(cur, '$');
  for (const id of cur.index.teachingOrder) if (!cur.index.letters[id]) errors.push(`curriculum: teachingOrder has "${id}" but no index entry`);
  return { errors, warnings: [] };
}

export async function validateRepo() {
  const errors = [];
  const warnings = [];
  const add = (r) => { errors.push(...r.errors); warnings.push(...r.warnings); };
  const kid = readJSON('content/kid-words.json');
  const gp = readJSON('content/go-play.json');
  add(validateKidWords(kid, readJSON('schema/kid-words.schema.json')));
  add(validateGoPlay(gp, readJSON('schema/go-play.schema.json'), kid));
  add(validateCurriculum(readJSON('content/curriculum.json')));
  errors.push(...checkSchema(readJSON('schema/stages.schema.json'), readJSON('content/stages.json')).map((e) => 'stages ' + e));
  const plans = readJSON('content/plans.json');
  errors.push(...checkSchema(readJSON('schema/plans.schema.json'), plans).map((e) => 'plans ' + e));
  for (const [id, p] of Object.entries(plans.activities || {})) if (!fs.existsSync(path.resolve(ROOT, p))) errors.push(`plans: activity "${id}" file ${p} is missing`);
  for (const [j, steps] of Object.entries(plans.journeys || {})) for (const s of steps) if (!plans.activities[s]) errors.push(`plans: journey "${j}" uses unknown activity "${s}"`);
  // The app's own lines (js/voice.js) follow the same spoken-text rules.
  const { VOICE } = await import(pathToFileURL(path.resolve(ROOT, 'js/voice.js')).href);
  const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[pre + k, v]] : flat(v, pre + k + '.')));
  for (const [k, v] of flat(VOICE)) spokenProblems(v).forEach((p) => errors.push(`js/voice.js ${k} ${p}`));
  return { errors, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  let result;
  if (args.includes('--kid') || args.includes('--goplay')) {
    result = { errors: [], warnings: [] };
    const kidPath = args.includes('--kid') ? args[args.indexOf('--kid') + 1] : null;
    const gpPath = args.includes('--goplay') ? args[args.indexOf('--goplay') + 1] : null;
    const kid = kidPath ? JSON.parse(fs.readFileSync(kidPath, 'utf8')) : null;
    if (kid) { const r = validateKidWords(kid, readJSON('schema/kid-words.schema.json')); result.errors.push(...r.errors); result.warnings.push(...r.warnings); }
    if (gpPath) { const r = validateGoPlay(JSON.parse(fs.readFileSync(gpPath, 'utf8')), readJSON('schema/go-play.schema.json'), kid); result.errors.push(...r.errors); result.warnings.push(...r.warnings); }
  } else {
    result = await validateRepo();
  }
  for (const w of result.warnings) console.log('warning  ' + w);
  for (const e of result.errors) console.log('ERROR    ' + e);
  console.log(result.errors.length ? `\n${result.errors.length} error(s).` : `\nContent OK (${result.warnings.length} warning(s)).`);
  process.exit(result.errors.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
