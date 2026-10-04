# Stage 4 watch list: testing with the child

What to watch for when the child uses kid mode alone, and what confusion looks like from the
outside. "Log" means the event log (parent mode will show it in v1.1; the events are already
recorded).

1. **Silence (a muted iPad).** The child taps the ball and nothing talks. They look at you or keep
   tapping. After three tries the app moves on, still silent. The fix is volume and Silent Mode.
   Code can't detect this, because a muted iPad still "starts" speaking.
2. **Find-it is hard at four.** The child taps the biggest or favourite picture, or waits for the
   glow and taps that. In the log: a low first-try rate, and idle level 2 before the taps. That
   means they've learned to wait for the hint. It's worth knowing, not a bug.
3. **The "like lion" hint can work against the question.** "Which one starts with lllll? Like
   lion!" names a lion, and no lion is on the find-it screen: the answer is never the anchor
   word. If the child looks for a lion instead of listening for the sound (scanning, saying
   "where's the lion?", tapping nothing), the hint is pulling attention away from the sound.
   The fix is one line in `js/voice.js`: drop "Like {anchor}!" from `findit.ask`, and "like
   {anchor}" from `findit.wrong`.
4. **🐊 "crocodile".** If the child says "crocodile" during the A words, the A find-it question is
   unfair. Swap the word.
5. **The bare sounds.** If "lllll" or "sssss" comes out as "el el el" or "ess ess ess", or "ah"
   doesn't sound like the start of apple, the child will copy the wrong thing. Check in Voice
   check. A's "ah" is the least confident string.
6. **"The lion letter."** Does "Tap the green lion letter" land, or does the child hunt for a
   lion somewhere else on the picker?
7. **The ✓ as a skip button.** The child taps ✓ straight away without going anywhere. In the
   log, `goplay.done` arrives seconds after `goplay.shown`. If they wander off and don't come
   back, that's the step working.
8. **Resting hands.** A hand parked on the top-right corner for 3 seconds drops the child into
   parent mode. A hand near the top-left presses home. In the log: `letter.left` clustered on
   one step.
9. **Sleeping letters.** The child keeps tapping them because they're letters they know.
   That's frustration building.
10. **Colours.** If the child calls the green card red, that's a colour-vision question (about 1
    in 12 boys), not a bug. The picture on each card still gets them there.
11. **The first tap after a break.** After the iPad locks or the child switches apps, their first
    tap only restarts the voice. They may think it "didn't work".
