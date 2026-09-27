// EVERY LINE THE APP SPEAKS, IN ONE TABLE.
//
// This is the text-to-speech tuning surface. To retune a line after hearing it on the iPad,
// change it here (or, for one letter's sound and words, in content/kid-words.json) and check it
// in parent mode > Voice check, which plays every line on the real device.
//
// Rules for every string here (CLAUDE.md K1, K12):
//  - Write what a speech engine will pronounce: real words, stretched letters ("lllll").
//    Never slashes ("/l/" is read "slash el slash"), never digits.
//  - Never say a letter's name on its own ("starts with L"). Letters are called by their
//    anchor picture: "the lion letter". A lone "A." is also often read as "uh".
//  - Find-it's first ask never names the answer (K11).
//
// Placeholders, filled at speak time:
//   {child}      the child's name (learner profile, on the device only)
//   {anchor}     the letter's anchor word, the first word in its kid list ("lion")
//   {sound}      the letter's bare sound, kidSound in content ("lllll")
//   {color}      the letter card's colour name ("green")
//   {word} {Word}  a picture's word, lower / capitalised
//   {tapped} {Tapped} {tappedSound}  the wrong picture that was tapped, and its letter's sound
//   {nextAnchor} the anchor of the suggested next letter
//   {grownups}   "Mom or Dad", from family setup
//
// FLAGGED (least confident, check these first on the device):
//   - content/kid-words.json kidSound for A ("ah"): close to, not the same as, short a.
//   - kidSound "lllll" and "sssss" may be read letter by letter ("el el el") by some voices.
//   - "Ah, ah, apple" in A's kidSays.

export const RATE = {
  normal: 0.92, // everyday speed, a touch slower than default for a four-year-old
  sound: 0.75,  // the bare letter sound, stretched
  pitch: 1.05,
};

export const VOICE = {
  wake: {
    greeting: "Hi, {child}! Let's play letters!",
  },
  common: {
    tapHere: 'Tap right here!',          // K4: a tap on empty space
    tapPicture: 'Tap a picture!',        // K4 on find-it, where three things are tappable
  },
  pick: {
    ask: 'Tap a letter!',
    idle1: 'Tap a letter!',
    idle2: 'Tap the {color} {anchor} letter!',
    idle2Name: 'Tap the {color} {anchor} letter. It starts your name!',
    sleeping: "Shh, that letter is still sleeping. Let's play the {anchor} letter!",
    home: 'Tap a letter!',
  },
  hear: {
    arrive: 'This is the {anchor} letter. Tap it!',
    idle1: 'Tap the {anchor} letter!',
    idle2: 'Tap the big letter to hear its sound!',
    // Taps play content: tap 1 = {sound}, tap 2 = kidSays, then {sound} again.
  },
  arrow: {
    show: 'Tap the arrow!',
    idle1: 'Tap the arrow!',
    idle2: 'Tap the big arrow to keep going!',
  },
  words: {
    line: '{Word}. {Word} starts with {sound}.', // default when a word has no "spoken" in content
    idle2: 'Tap the arrow for the next picture!',
  },
  findit: {
    ask: 'Which one starts with {sound}? Like {anchor}!', // K11: never names the answer
    idle1: 'Which one starts with {sound}?',
    hint: 'Listen: {word}. Tap the {word}!',                // names the answer: counts as hinted
    wrong: '{Tapped}! {Tapped} starts with {tappedSound}. Which one starts like {anchor}?',
    right: 'Yes! {Word} starts with {sound}!',
  },
  star: {
    done: 'You did the {anchor} letter!',
  },
  goplay: {
    // The prompt itself is content/go-play.json "spoken". K3a: said once, repeated once, then quiet.
    done: 'Yay! You did it!',
    next: 'Tap the {nextAnchor} letter to keep going.',
    again: 'Or tap here to play again.',
    nextIdle2: 'Tap the {nextAnchor} letter!',
    onlyAgain: 'Tap here to play again.',
  },
};

export const COLOR_NAMES = { red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue', purple: 'purple' };

/** Look up a line by dotted key ("findit.ask"). */
export function line(key) {
  const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), VOICE);
  if (typeof v !== 'string') throw new Error('No voice line: ' + key);
  return v;
}
