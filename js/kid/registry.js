// Activity registry. Every kid activity is a module listed in content/plans.json whose default
// export is { id, stages: [...], run(ctx) }. Activities declare which learner stages they are for;
// the app only offers a learner the journeys whose activities all support that learner's stage.
//
// Adding an activity: write js/kid/activities/<id>.js, then add one line to plans.json
// ("activities") and put its id in a journey. The offline cache (sw.js) reads the same list,
// so no other file changes. An activity receives "the thing being taught" in ctx.letter today;
// a future story or toddler activity can take other content through ctx without engine changes.

const acts = new Map();

export function registerActivity(def) {
  if (!def || !def.id || !Array.isArray(def.stages) || typeof def.run !== 'function') {
    throw new Error('An activity needs { id, stages: [], run(ctx) }');
  }
  acts.set(def.id, def);
}

export const getActivity = (id) => acts.get(id) || null;

export async function loadActivities(plans, base = './', importFn = (p) => import(p)) {
  const entries = Object.entries(plans.activities || {});
  await Promise.all(entries.map(async ([id, path]) => {
    const mod = await importFn(new URL(path, new URL(base, globalThis.location ? globalThis.location.href : 'file:///')).href);
    const def = mod.default;
    if (!def || def.id !== id) throw new Error(`plans.json lists ${id} at ${path}, but that module exports ${def && def.id}`);
    registerActivity(def);
  }));
}

/** Journey ids from plans.json that a learner at this stage can play. Empty list = no hand-off button. */
export function journeysForStage(plans, stage) {
  return Object.entries(plans.journeys || {})
    .filter(([, steps]) => steps.length && steps.every((id) => { const a = acts.get(id); return a && a.stages.includes(stage); }))
    .map(([jid]) => jid);
}
