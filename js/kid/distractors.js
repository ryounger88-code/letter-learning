// Picks the wrong answers for a find-it question. Pure function: tested in tests/.
//
// Rules:
//  - never a word from the target letter, and never from a letter taught with the same sound
//    (C and K share a sound group in content/letter-sounds.json), so no distractor can start
//    with the target sound;
//  - prefer letters the child has already finished (a star), so the question doubles as review;
//  - then other playable letters; then any letter that has kid words at all (first-letter case,
//    when nothing is finished yet);
//  - two distractors from two different letters when possible; no picture repeated.

function shuffle(list, random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function pickDistractors({ content, progress, letter, target, count = 2, random = Math.random }) {
  const group = content.soundGroup(letter);
  const letters = content.kidContentLetters().filter((id) => id !== letter && content.soundGroup(id) !== group);
  const starred = (id) => ((progress && progress.letters && progress.letters[id]) || {}).stars > 0;
  const ready = (id) => !!(content.kid(id) || {}).kidReady;
  const pools = [
    letters.filter((id) => ready(id) && starred(id)),
    letters.filter((id) => ready(id) && !starred(id)),
    letters.filter((id) => !ready(id)),
  ];
  const chosen = [];
  const usedLetters = new Set();
  const usedPictures = new Set([target.picture]);
  const ok = (w, id) => w && w.picture && !usedPictures.has(w.picture) && w.word[0] !== letter;
  // First pass: one word per letter. Second pass: allow a second word from a letter already used.
  for (const pass of [0, 1]) {
    for (const pool of pools) {
      for (const id of shuffle(pool, random)) {
        if (chosen.length >= count) return chosen;
        if (pass === 0 && usedLetters.has(id)) continue;
        const w = shuffle(content.kid(id).words || [], random).find((x) => ok(x, id));
        if (!w) continue;
        chosen.push({ ...w, letter: id });
        usedLetters.add(id);
        usedPictures.add(w.picture);
      }
    }
  }
  return chosen;
}
