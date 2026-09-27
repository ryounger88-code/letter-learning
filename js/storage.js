// Storage module. The ONLY file in the app that touches browser storage.
//
// Everything the app remembers goes through the store this file creates:
//   - the device id,
//   - family settings (grown-up labels, current mode, active learner, chosen voice),
//   - learner profiles,
//   - the event log: every interaction, append-only, tagged with learnerId and deviceId.
//
// Events are never edited or deleted. Totals ("how many stars") are derived at read time
// by getProgress(). That is what makes the log mergeable: two devices' logs combine by
// concatenating and de-duplicating on the event id (see mergeEvents), with nothing to resolve.
//
// Events are stored per learner, per letter (key "ev:<learnerId>:<letter>", or "_" for events
// with no letter), so two devices playing different letters never write the same key.
//
// WHERE SYNC GOES (Phase 3): write a second backend with the same get/set/keys/remove shape
// that also pushes new events to the family key-value store, and pulls remote events into
// mergeEvents(). Pass it to createStore({ backend }). No screen changes: screens only ever
// call the store methods below and subscribe() for updates.

const PREFIX = 'll1:';

/** Browser storage backend. Throws on creation if storage is unavailable (private mode, blocked). */
export function localBackend(ls = globalThis.localStorage) {
  const probe = PREFIX + 'probe';
  ls.setItem(probe, '1');
  ls.removeItem(probe);
  return {
    persistent: true,
    get(key) {
      const raw = ls.getItem(PREFIX + key);
      if (raw == null) return undefined;
      try { return JSON.parse(raw); } catch { return undefined; }
    },
    set(key, value) { ls.setItem(PREFIX + key, JSON.stringify(value)); },
    remove(key) { ls.removeItem(PREFIX + key); },
    keys(prefix = '') {
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
      }
      return out;
    },
    bytes() {
      let n = 0;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(PREFIX)) n += k.length + (ls.getItem(k) || '').length;
      }
      return n * 2; // UTF-16
    },
  };
}

/** In-memory fallback: the app still works, but nothing survives a reload. Parent mode says so. */
export function memoryBackend() {
  const m = new Map();
  return {
    persistent: false,
    get: (k) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : undefined),
    set: (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); },
    remove: (k) => { m.delete(k); },
    keys: (prefix = '') => [...m.keys()].filter((k) => k.startsWith(prefix)),
    bytes: () => 0,
  };
}

export const EVENT_TYPES = [
  'session.start', 'session.end',        // a kid-mode session (hand-off to parent gate)
  'letter.open', 'letter.left',          // a letter journey started / left early with the home button
  'activity.start', 'activity.end',      // each step of a journey
  'tap.empty',                           // a tap that missed every target
  'findit.result',                       // one find-it question, with every attempt
  'letter.star',                         // a star earned
  'goplay.shown', 'goplay.done', 'goplay.skipped',
  'speech.check',                        // did the voice start after the wake-up tap?
  'parent.session',                      // a lesson the parent ran and rated
];

function rid(random, n = 8) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(random() * a.length)];
  return s;
}

export function createStore({ backend, now = () => new Date(), random = Math.random } = {}) {
  const b = backend || memoryBackend();
  const listeners = new Set();
  const buckets = new Map(); // key -> events[]

  let device = b.get('device');
  if (!device || !device.id) {
    device = { id: 'd' + rid(random, 10), createdAt: now().toISOString() };
    b.set('device', device);
  }
  let family = b.get('family') || {};
  let learners = b.get('learners') || {};

  function notify(what) { for (const fn of listeners) { try { fn(what); } catch (e) { console.error(e); } } }
  function bucketKey(learnerId, letter) { return `ev:${learnerId}:${letter || '_'}`; }
  function bucket(key) {
    if (!buckets.has(key)) buckets.set(key, b.get(key) || []);
    return buckets.get(key);
  }
  function learnerBuckets(learnerId) {
    return b.keys(`ev:${learnerId}:`).map((k) => bucket(k));
  }

  const store = {
    get persistent() { return b.persistent; },
    get deviceId() { return device.id; },

    // ---------- family settings ----------
    getFamily() { return { grownups: [], ...family }; },
    saveFamily(patch) {
      family = { ...family, ...patch, updatedAt: now().toISOString() };
      b.set('family', family);
      notify('family');
      return store.getFamily();
    },

    // ---------- learners ----------
    getLearners() { return Object.values(learners).sort((x, y) => (x.createdAt || '').localeCompare(y.createdAt || '')); },
    getLearner(id) { return learners[id] || null; },
    saveLearner(profile) {
      const t = now().toISOString();
      const id = profile.id || 'k' + rid(random, 8);
      const prev = learners[id] || {};
      learners[id] = {
        interests: [], stage: 'letters', sessionsPerWeek: 4, pronoun: 'they', ageBand: null,
        ...prev, ...profile, id, createdAt: prev.createdAt || t, updatedAt: t,
      };
      b.set('learners', learners);
      notify('learners');
      return learners[id];
    },
    getActiveLearner() {
      const id = family.activeLearnerId;
      return (id && learners[id]) || store.getLearners()[0] || null;
    },
    setActiveLearner(id) { store.saveFamily({ activeLearnerId: id }); },

    // ---------- events ----------
    /** Append one event. Fills id, time, device. Returns the stored event. */
    recordEvent({ learnerId, type, letter = null, activity = null, sessionId = null, data = {} }) {
      if (!learnerId) throw new Error('recordEvent needs a learnerId');
      if (!EVENT_TYPES.includes(type)) throw new Error('Unknown event type: ' + type);
      const at = now().toISOString();
      const evt = {
        id: `${device.id}-${Date.parse(at).toString(36)}-${rid(random, 5)}`,
        v: 1, learnerId, deviceId: device.id, sessionId, at, type, letter, activity, data,
      };
      const key = bucketKey(learnerId, letter);
      const list = bucket(key);
      list.push(evt);
      try { b.set(key, list); } catch (e) { list.pop(); throw e; }
      notify('events');
      return evt;
    },
    recordLetterVisit(learnerId, letter, data = {}, sessionId = null) {
      return store.recordEvent({ learnerId, type: 'letter.open', letter, sessionId, data });
    },
    recordFindItResult(learnerId, letter, data, sessionId = null) {
      return store.recordEvent({ learnerId, type: 'findit.result', letter, activity: data.activity || 'find-it', sessionId, data });
    },
    recordSession(learnerId, { letterId, rating, notes = '', teacher = '', date }) {
      return store.recordEvent({
        learnerId, type: 'parent.session', letter: letterId,
        data: { rating, notes, teacher, date: date || now().toISOString().slice(0, 10) },
      });
    },
    getEvents(learnerId, { letter, type } = {}) {
      const lists = letter !== undefined ? [bucket(bucketKey(learnerId, letter))] : learnerBuckets(learnerId);
      let out = lists.flat();
      if (type) out = out.filter((e) => (Array.isArray(type) ? type.includes(e.type) : e.type === type));
      return out.sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id));
    },
    /** Parent-run lessons, newest last, for every learner (or one). */
    getParentSessions(learnerId) {
      const ids = learnerId ? [learnerId] : Object.keys(learners);
      return ids.flatMap((id) => store.getEvents(id, { type: 'parent.session' }).map((e) => ({
        learnerId: id, letterId: e.letter, createdAt: e.at, ...e.data,
      })));
    },
    /** Totals derived from the event log. Nothing here is stored. */
    getProgress(learnerId) {
      const letters = {};
      const stars = [];
      const L = (id) => (letters[id] ||= { opens: 0, stars: 0, lastPlayed: null, findIt: { rounds: 0, firstTry: 0 }, left: {}, goPlayDone: 0 });
      for (const e of store.getEvents(learnerId)) {
        if (!e.letter) continue;
        const p = L(e.letter);
        if (e.type === 'letter.open') { p.opens++; p.lastPlayed = e.at; }
        if (e.type === 'letter.star') { p.stars++; stars.push({ letter: e.letter, at: e.at }); }
        if (e.type === 'findit.result') { p.findIt.rounds++; if (e.data && e.data.firstTry) p.findIt.firstTry++; }
        if (e.type === 'letter.left') { const a = e.activity || '?'; p.left[a] = (p.left[a] || 0) + 1; }
        if (e.type === 'goplay.done') p.goPlayDone++;
      }
      return { letters, stars };
    },
    /** Merge events from another device or a progress file. De-duplicates on id. Returns how many were new. */
    mergeEvents(events) {
      let added = 0;
      const touched = new Set();
      for (const e of events || []) {
        if (!e || !e.id || !e.learnerId || !e.type || !e.at) continue;
        const key = bucketKey(e.learnerId, e.letter);
        const list = bucket(key);
        if (list.some((x) => x.id === e.id)) continue;
        list.push(e); added++; touched.add(key);
      }
      for (const key of touched) { bucket(key).sort((x, y) => x.at.localeCompare(y.at)); b.set(key, bucket(key)); }
      if (added) notify('events');
      return added;
    },

    // ---------- housekeeping ----------
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    usageBytes() { return b.bytes(); },
    /** Ask the browser not to evict our data. Best effort; installed apps usually get it. */
    async requestPersist() {
      try { return !!(await globalThis.navigator?.storage?.persist?.()); } catch { return false; }
    },
    /** Another tab changed storage: drop caches and re-read. */
    reload() {
      buckets.clear();
      family = b.get('family') || {};
      learners = b.get('learners') || {};
      notify('reload');
    },
  };
  return store;
}
