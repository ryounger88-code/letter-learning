// Text helpers: placeholder filling and escaping.
//
// Content never contains a child's name, a pronoun for the child, or a grown-up's name.
// It uses placeholders that are filled from the learner profile and family settings,
// which live only on the device:
//   {child}  the child's name          {CHILD}  the same, in capitals
//   {them}   him / her / them          {their}  his / her / their
//   {themself} himself / herself / themselves      {Their}  capitalised {their}
//   {grownups}  "Mom or Dad" (the labels from family setup)

export const PRONOUNS = {
  he: { them: 'him', their: 'his', themself: 'himself', Their: 'His' },
  she: { them: 'her', their: 'her', themself: 'herself', Their: 'Her' },
  they: { them: 'them', their: 'their', themself: 'themselves', Their: 'Their' },
};

export function learnerVars(learner) {
  const name = (learner && learner.name) || 'your child';
  const p = PRONOUNS[(learner && learner.pronoun) || 'they'] || PRONOUNS.they;
  return { child: name, CHILD: name.toUpperCase(), ...p };
}

/** "Mom or Dad", "Mom, Dad or Nana", or "a grown-up" when none are set. */
export function joinOr(list) {
  const xs = (list || []).map((s) => String(s).trim()).filter(Boolean);
  if (!xs.length) return 'a grown-up';
  if (xs.length === 1) return xs[0];
  return xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1];
}

/** Replace {key} with vars[key]. Unknown keys are left as they are, so mistakes stay visible. */
export function fill(text, vars) {
  return String(text).replace(/\{([A-Za-z]+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

export function fillLearner(text, learner, extra = {}) {
  return fill(text, { ...learnerVars(learner), ...extra });
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
