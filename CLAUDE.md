# Letter Lab

A letter-sound app for young children, with a parent guide. **Parent mode** is the lesson guide
for the grown-up running a session. **Kid mode** is for a pre-reader holding the tablet alone:
everything is spoken, one glowing target at a time. It's a static, installable web app (PWA) on
GitHub Pages. There's no build step, no framework, and no backend. Progress lives on the device.

The first learner is a four-year-old at the `letters` stage; a toddler joins later. **Names never go
in this repo.** Each child's name, pronoun and stage, and the family's grown-up labels ("Mom",
"Dad"), are typed into first-run setup and stored only on the device.

## One engine, many learners. Never per-kid code.

Every child runs the same code. What differs between children is data: the learner profile, the
stage, the curriculum overlays. If you ever write `if (child === ...)`, it belongs in a data file.
Activities declare which stages they're for (`stages: [...]`); the app only offers a child the
journeys that fit their stage.

## Run it

```sh
python3 -m http.server 8765        # from the repo root, then open http://localhost:8765/
node tools/validate.mjs            # content checks (also runs in CI)
node --test "tests/*.test.mjs"     # unit tests (also runs in CI)
node tools/e2e.mjs                 # browser check of the kid-mode checklist; needs Playwright locally
```

ES modules and `fetch` don't work from `file://`, so always use a local server. Speech needs a real
browser. On a phone on the same Wi-Fi, open `http://<computer-ip>:8765/`.

## Map

| Path | What |
|---|---|
| `index.html`, `manifest.webmanifest`, `sw.js` | Shell, install manifest, offline cache |
| `theme.css` | The shared theme, **rules identical to the other site's copy**. Never edit rules here |
| `css/letterlab.css`, `css/kid.css` | Letter Lab's overrides; kid-mode styles |
| `content/*.json` | The curriculum. Data only, validated |
| `schema/*.json` | Shapes of content, learner profiles and events |
| `js/storage.js` | **The only file that touches browser storage** |
| `js/voice.js` | **Every line the app speaks** (the TTS tuning surface) |
| `js/speech.js` | Speech engine wrapper |
| `js/choose-next.js` | **"What comes next" lives here and nowhere else** |
| `js/kid/` | Kid-mode controller, idle ladder, UI parts, activity registry, `activities/*.js` |
| `js/parent/` | Parent mode, Voice check, install hint |
| `tools/validate.mjs`, `tests/` | Validator and unit tests |
| `docs/` | Reviewer notes (deliberate deviations), Stage 4 watch list (testing with the child) |

## Content

- `content/curriculum.json`: v1's `index` (teaching order, per-letter theme/colour/status) and
  `lessons` (full parent lessons for L, M, S, A). It uses the placeholders `{child}`, `{CHILD}`,
  `{them}`, `{their}`, `{themself}`. The subject pronoun is avoided (write `{child}` instead),
  so "they" never breaks verb agreement.
- `content/kid-words.json`: kid-mode content per letter, in exactly the shape Astra hands over:
  `kidSound` (bare sound), `kidSays` (short kid line), `words[]` of `{ word, picture, spoken? }`
  with the **first word as the anchor**, plus `kidReady` and optional `flag` / `note`.
- `content/go-play.json`: off-screen prompts: `ages`, `supervision` (`alone`/`grown-up`), `tags`,
  and `inventory` (reserved for the future "things we have at home" list). Grown-ups are
  `{grownups}`, never a typed name.
- `content/stages.json` (`soloPlay` false means sessions start only from parent mode),
  `content/letter-sounds.json` (sound groups; C and K share one), `content/plans.json` (activity
  modules and journeys).

**Add a kid letter:** add its entry to `kid-words.json` and at least one prompt to
`go-play.json`, then run the validator. Hear every line in parent mode > Voice check on the real
device, and only then set `"kidReady": true`. The parent lesson doesn't need to be built first.
**Add an activity:** a new `js/kid/activities/<id>.js` exporting `{ id, stages, run(ctx) }`, one
line in `plans.json`, and add it to a journey. The offline cache reads `plans.json` too. A future
Bible `story` beat or toddler "tap and hear" is just another activity.

## Kid-mode checklist (the master copy; code comments cite these numbers)

1. **K1** Spoken, never written. The only text on a kid screen is the letter or word being taught, in Andika.
2. **K2** Say it and show it. Every instruction has one target that wears the ring and pulses. One target at a time.
3. **K3** Idle ladder, timed from when speech *ends*: ~5s → repeat; ~12s more → a more specific prompt and a stronger pulse; then a chime every 8s, no words; after a minute, a slow pulse only. Any tap resets it. Timings are in `js/kid/idle.js` `TIMING`.
   - **K3a** *Named exception:* go-play says its prompt once, repeats it once at ~30s, then stays quiet. The child is supposed to walk away.
4. **K4** Every tap does something. A tap on empty space bounces the target and says "Tap right here!" (at most every 4s). A sleeping letter points to a ready one. No dead ends: if speech never starts, the wake screen moves on after 3 tries.
5. **K5** Tap targets are at least 90px in both directions, generously spaced.
6. **K6** Icons and pictures only: the house, arrow, again and check are inline SVG; pictures are emoji.
7. **K7** Home is top-left on every kid screen, one tap, no confirmation. The wake screen is the exception, because the whole screen is the button.
8. **K8** Nothing navigates away. No `<a>`, `target`, `window.open`, forms or history changes in kid mode.
9. **K9** The parent gate is a 3-second hold on the top-right corner. Nothing else lives there; the stars sit top-centre.
10. **K10** Speech: the first utterance comes from inside the first tap (iOS unlock); `cancel()` before every `speak()`; handle `voiceschanged`; re-prime after returning from the background; every line has a safety timeout.
11. **K11** Find-it's first ask never names the answer, and all three pictures breathe equally. Only the hint ladder names it. `firstTry` means the first tap was right with no hint.
12. **K12** Letters are called by their anchor picture ("the lion letter"). The voice never says a letter's name alone, since a lone "A." is also read as "uh". *Scoped to today's sound-first activities;* a later activity may teach letter names on purpose.
13. **K13** Reduced motion: the target keeps a still, wider ring, and taps still get a visible reaction. Code never waits on `animationend`, because the shared theme turns animations off.
14. **K14** Portrait and landscape both work, with no horizontal scroll. Word, find-it and go-play screens sit side by side in landscape and stack in portrait.
15. **K15** A child whose stage isn't `soloPlay` never enters kid mode on relaunch. There's no hand-off button for a stage with no activities.
16. **K16** Kids never pick who's playing. The parent does, in parent mode.

A web page can't stop a child leaving the app (home gesture, app switcher). That is **iPad Guided
Access** (Settings → Accessibility → Guided Access, triple-click to start), a device setting, not code.

## Speech: where strings live, and the gotchas

- App lines are in `js/voice.js`. Per-letter lines (`kidSound`, `kidSays`, a word's `spoken`,
  go-play `spoken`) are in `content/`. The validator checks both for slashes, digits and lone
  letters. Voice check plays every line; tune by ear on the actual device.
- `"/l/"` is read "slash el slash". `"llll"` can come out "el el el". Stop sounds (b, d, g, k, p, t) and
  short vowels are the hardest; A's `kidSound` is the least confident string.
- iOS stays silent until speech starts inside a tap, drops speech after backgrounding, and sometimes
  never fires `onend`. `js/speech.js` handles all three. A muted iPad still "starts" speaking, so the
  wake check can't detect it.
- Web Audio (the chimes) is also muted by the iPad's silent mode.

## Storage and events

- `js/storage.js` is the only place that reads or writes storage: device id, family settings,
  learner profiles, and an **append-only event log**. Each event carries `learnerId`, `deviceId`,
  `id` and `at`, and is stored per learner, per letter. Totals are derived by `getProgress()`.
  Find-it logs every attempt: the picture tapped, ms from the end of the question, the idle level.
- **Where sync goes (Phase 3):** a second backend with the same `get/set/keys/remove` shape,
  passed to `createStore({ backend })`, pushing new events to the family key-value store and pulling
  remote ones through `mergeEvents()` (union by event id; no conflicts). Screens don't change.
- **The 7-day wipe:** in a Safari tab, script storage is deleted after 7 days of use without a
  visit. Installed to the Home Screen, it isn't. Parent mode shows an install card in a tab.
  A wipe can't be detected afterwards, because the evidence is wiped too; the app just starts fresh.
- `localStorage` holds about 5 MB. That's well over a year of daily play at a few KB a journey.
  Move to IndexedDB inside `storage.js` if that ever gets close.

## Releasing

- **Bump `VERSION` in `sw.js` on every release**, or installed copies keep old files. If you add
  a file, add it to `CORE` in `sw.js` (activity modules come from `plans.json`).
- Pages serves `main` from the repo root. Commit and push, then wait a minute.
- **Privacy, before every push:** search the tree and history for family names, places and the
  other site's name. Keep that list of terms off the repo; the repo is public.
- **Commit identity:** every commit uses a GitHub noreply address, never a personal email. Set it
  once per clone with `git config user.email "<id>+<login>@users.noreply.github.com"` (shown under
  GitHub → Settings → Emails). Keep "Keep my email addresses private" and "Block command line
  pushes that expose my email" switched on, so a slip is refused at push time.

## Learned the hard way

- Playwright's `click()` waits for an element to stop moving, and a pulsing target never does.
  Tests tap by position (`tools/e2e.mjs`).
- A broad `.kid button { font: inherit; color: inherit }` beat the card and word styles on
  specificity (dark glyphs, tiny words). It's now `:where(.kid) button`.
- `theme.css` has its own `.steps` and `.card:hover` lift; parent mode uses `.ll-steps` and turns
  the lift off for content cards.
- The ring needs room: 21px outside the card. Keep padding and gaps bigger than that, or it's clipped.

## Where this is going

One app, many children, each adapting. The **fast loop** (Phase 3) is plain rules over the event
log inside `chooseNext`: spaced review using `sessionsPerWeek` (default 4), mastery, and pairing
confusable pictures. The **slow loop** (Phase 4) is a weekly job that sends each child's log to
the Claude API and gets back curriculum *proposals*. The validator checks them, and a parent
approves before any child sees them. Version one of approval is a GitHub pull request; the
long-term home is an **approval screen inside parent mode** ("here's what's proposed this week:
approve or skip"), because not every parent is on GitHub. The same parent-mode curation (approvals,
interests, the "things we have at home" list, per-family overlays) is what later lets other
families use this for their own children. That is also the point where accounts, hosting and
children's-privacy law (COPPA) need real legal advice. Keep every parent-editable setting in the
learner profile or family settings, never in code. **When adaptation is built, it optimises for
learning (first-try accuracy on a letter days after last seeing it), never for engagement, taps
or time.** An engagement-optimised kids' app drifts toward easy and flashy, which is the opposite
of teaching.
