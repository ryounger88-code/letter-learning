// Loads the curriculum (content/*.json) and answers questions about it.
// Content is data, reviewed and validated (tools/validate.mjs). Code never hardcodes a letter's words.

export const CONTENT_FILES = {
  curriculum: 'content/curriculum.json',
  kid: 'content/kid-words.json',
  goPlay: 'content/go-play.json',
  stages: 'content/stages.json',
  sounds: 'content/letter-sounds.json',
  plans: 'content/plans.json',
};

export async function fetchContent(base = './', fetchFn = globalThis.fetch) {
  const raw = {};
  await Promise.all(Object.entries(CONTENT_FILES).map(async ([k, path]) => {
    const r = await fetchFn(base + path);
    if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
    raw[k] = await r.json();
  }));
  return makeContent(raw);
}

/** Wrap the raw JSON files in a small query API. Pure: usable from Node tests. */
export function makeContent(raw) {
  const cur = raw.curriculum;
  const order = cur.index.teachingOrder;
  const kidLetters = (raw.kid && raw.kid.letters) || {};
  const sounds = (raw.sounds && raw.sounds.letters) || {};

  const c = {
    raw,
    order,
    index: cur.index.letters,
    note: cur.index.note,
    lessons: cur.lessons,
    stages: raw.stages.stages,
    plans: raw.plans,
    goPlay: raw.goPlay.prompts,

    colorKey: (id) => (cur.index.letters[id] || {}).colorKey || 'green',
    lessonReady: (id) => (cur.index.letters[id] || {}).status === 'ready' && !!cur.lessons[id],
    kid: (id) => kidLetters[id] || null,
    /** Letters a child may play in kid mode: has kid content and a parent switched it on. Teaching order. */
    kidReadyLetters: () => order.filter((id) => kidLetters[id] && kidLetters[id].kidReady && (kidLetters[id].words || []).length >= 4),
    /** Letters with kid content at all (ready or not). Used by Voice check and as a distractor fallback. */
    kidContentLetters: () => order.filter((id) => kidLetters[id] && (kidLetters[id].words || []).length),
    anchor: (id) => { const k = kidLetters[id]; return k && k.words && k.words[0] ? k.words[0] : null; },
    soundGroup: (id) => (sounds[id] || {}).group || id,
    /** The go-play prompt for a letter that suits this learner's stage and age band. */
    goPlayFor: (id, learner) => {
      const stage = (learner && learner.stage) || 'letters';
      const list = raw.goPlay.prompts.filter((p) => p.letter === id && (p.stages || []).includes(stage));
      return list[0] || null;
    },
  };
  return c;
}
