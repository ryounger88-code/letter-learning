# Reviewer notes: deliberate deviations

Read this before auditing. Each item below would normally be flagged as a defect. Here it's a
decision, and the reason is given. The kid-mode rules are the numbered checklist (K1–K16) in
`CLAUDE.md`; code comments cite those numbers where each rule is enforced.

**When reporting findings**, cite the checklist number and the file and line. Findings are triaged
into: real, false positive given these constraints, or real but not worth it.

## Architecture

- **No framework, no bundler, no build step.** The app is plain ES modules and static files
  served by GitHub Pages. The family maintaining it is not a dev team, and a build step would be
  one more thing to break. What you see in the repo is what ships.
- **No backend and no accounts.** Progress is stored on the device only, in this version. Sync is
  planned behind the existing storage interface (`js/storage.js`, see `CLAUDE.md`).
- **`localStorage`, not IndexedDB.** It's simpler and more reliable on iOS, and about 5 MB is years of
  play. It's contained in `storage.js`, so a swap is local to that file.
- **`innerHTML` templates in parent mode** (ported from v1). Content comes from the reviewed
  repo; everything a person types (names, notes, interests) goes through `esc()`. Kid mode builds
  elements with `document.createElement`.
- **Hand-written JSON Schema checker** in `tools/validate.mjs`, covering only the subset
  `schema/*.json` uses, so the validator has no dependencies.

## Content

- **Emoji as pictures.** There are no image files to load or cache, they render everywhere, and they
  work offline. The cost: emoji look different per device, and a child may name one differently
  from the lesson (🐊 "crocodile"). The `picture` field is data, so real artwork is a data change.
- **Placeholders for names and pronouns** (`{child}`, `{them}`, `{their}`, `{grownups}`). The repo
  is public; names live on the device only. Subject pronouns are replaced with the name on
  purpose, so "they" never breaks verb agreement.
- **The voice never says letter names** (K12), in today's activities. This is scoped, not permanent.
- **`kidSound` strings like "lllll" and "ah"** are deliberately not phonetic notation. They're
  what a speech engine will pronounce. They're tuned by ear on the device (Voice check).

## Kid mode

- **No visible text except the letter or word being taught** (K1). Buttons have `aria-label`s for
  assistive technology, but nothing is written on screen. This is for a child who can't read.
- **`user-select: none`, `-webkit-touch-callout: none`, `touch-action: manipulation`,
  context menu and pinch suppressed in kid mode.** Accidental selection, callouts or zoom strand a
  four-year-old. Parent mode keeps all of them.
- **An invisible parent gate** (a 3-second hold on the top-right corner, K9) with no visual hint in
  kid mode. It's discoverable only by the parent, which is the point. Parent mode tells the parent
  where it is.
- **Home without confirmation** (K7). A child can't read a confirmation dialog.
- **The wake screen has no home button** (K7 exception). The whole screen is the button, and there
  is nowhere "home" could go.
- **Custom reduced-motion handling** (K13). The shared theme turns every animation off. Kid mode
  can't simply remove motion, because the pulsing ring is the instruction. It keeps a still,
  wider ring instead, and reactions become outline flashes. Code never waits on
  `animationend`, since with motion off it never fires.
- **Idle nagging on purpose** (K3), and **no nagging on the go-play screen** (K3a). The child is
  sent away from the screen there.
- **Find-it doesn't glow the answer at first** (K11), which contradicts "always show the target".
  All three pictures breathe equally instead, so the first try measures listening, not following
  a glow.
- **Speech via `speechSynthesis`, no audio files.** Voices differ per device. Voice check exists
  to tune strings on the real device.
- **Chimes are synthesised with Web Audio**, for the same no-files reason.
- **Kid mode is light-only, and parent mode has no dark theme.** The shared theme is light-only, and
  the letter colours are tuned for a light ground.

## Styling

- **`theme.css` is vendored unchanged** (rules byte-identical to the other site's copy; only
  comments differ). Every Letter Lab change is in `css/letterlab.css`, including three contrast
  fixes the shared theme doesn't have: teal (not sage) buttons, gold only as a highlight (never
  text), and a teal focus ring.
- **Fonts are bundled and subset to Latin.** Offline use and Andika's single-story `a` require
  it. The arrow and × symbols fall back to system fonts.

## Testing

- **No DOM test framework.** `tools/e2e.mjs` drives the real app in Chromium with speech and audio
  replaced by recorders, and checks the kid-mode checklist at four screen sizes. It needs
  Playwright locally, so it isn't in CI. CI runs the validator and the unit tests.
