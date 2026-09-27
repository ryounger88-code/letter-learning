// "What comes next" lives here and nowhere else.
//
// Today's rule: the first playable letter (teaching order) that has no star yet;
// otherwise the playable letter played least recently.
//
// This is where spaced review and mastery rules (Phase 3), and later AI-proposed plans,
// plug in. learner.sessionsPerWeek (default 4) is passed in for those rules; nothing
// uses it yet. Adaptation must optimise for learning (first-try accuracy on a letter
// days after last seeing it), never for engagement, taps or time.

/**
 * @param learner  learner profile ({ stage, sessionsPerWeek, ... })
 * @param progress store.getProgress(learner.id)
 * @param content  makeContent(...) result
 * @param opts.exclude  a letter not to suggest (the one just finished)
 * @returns {{letter: string, reason: string} | null}
 */
export function chooseNext(learner, progress, content, { exclude = null } = {}) {
  const letters = content.kidReadyLetters().filter((id) => id !== exclude);
  if (!letters.length) return null;
  const p = (id) => (progress && progress.letters && progress.letters[id]) || {};
  const unstarred = letters.find((id) => !(p(id).stars > 0));
  if (unstarred) return { letter: unstarred, reason: 'first-unfinished' };
  const byLeastRecent = [...letters].sort((a, b) => (p(a).lastPlayed || '').localeCompare(p(b).lastPlayed || ''));
  return { letter: byLeastRecent[0], reason: 'least-recent' };
}
