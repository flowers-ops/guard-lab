// Pure voice metadata shared by the renderer, the Electron voice worker and the CLI.
// Kokoro voice styles ship inside the kokoro-js package, so every listed voice works offline
// once the Kokoro model itself is installed.

export const DEFAULT_VOICES = Object.freeze({
  robot: 'kokoro:bm_george',
  male: 'kokoro:am_michael',
  female: 'kokoro:af_heart',
});

const entry = (key, name, accent, gender) =>
  Object.freeze({ id: 'kokoro:' + key, name, accent, gender });

// Curated English voices (best upstream grades first within each group).
export const VOICES = Object.freeze([
  entry('bm_george', 'George', 'British', 'male'),
  entry('bm_fable', 'Fable', 'British', 'male'),
  entry('bm_lewis', 'Lewis', 'British', 'male'),
  entry('bm_daniel', 'Daniel', 'British', 'male'),
  entry('bf_emma', 'Emma', 'British', 'female'),
  entry('bf_isabella', 'Isabella', 'British', 'female'),
  entry('am_michael', 'Michael', 'American', 'male'),
  entry('am_fenrir', 'Fenrir', 'American', 'male'),
  entry('am_puck', 'Puck', 'American', 'male'),
  entry('am_echo', 'Echo', 'American', 'male'),
  entry('af_heart', 'Heart', 'American', 'female'),
  entry('af_bella', 'Bella', 'American', 'female'),
  entry('af_nicole', 'Nicole', 'American', 'female'),
  entry('af_sarah', 'Sarah', 'American', 'female'),
]);

const byId = new Map(VOICES.map((voice) => [voice.id, voice]));

export function voiceInfo(id) {
  return byId.get(String(id || '')) || null;
}

/** Kokoro's internal style name (e.g. "bm_george") for a catalog id, or null. */
export function kokoroStyle(id) {
  return voiceInfo(id) ? String(id).slice('kokoro:'.length) : null;
}

function appearanceGender(appearance) {
  const value =
    typeof appearance === 'string' ? appearance : appearance?.id || appearance?.voice || '';
  if (/^(robot|guard|g-01)$/i.test(value)) return 'robot';
  if (/female|woman|kokoro:[ab]f_/i.test(value)) return 'female';
  return 'male';
}

/** Default voice id for an actor ('robot' | 'human') and optional appearance. */
export function defaultVoice(actor = 'robot', appearance) {
  if (actor === 'robot') return DEFAULT_VOICES.robot;
  return appearanceGender(appearance) === 'female' ? DEFAULT_VOICES.female : DEFAULT_VOICES.male;
}

/** A valid catalog id: the requested one when known, otherwise the actor's default. */
export function resolveVoice(id, actor = 'robot', appearance) {
  return voiceInfo(id) ? String(id) : defaultVoice(actor, appearance);
}

/**
 * Voices suited to an appearance ('male' | 'female' | 'robot' | an APPEARANCES entry), with
 * the default first, then matching gender, then the rest. Every voice remains selectable.
 */
export function voicesFor(appearance) {
  const kind = appearanceGender(appearance);
  const preferred =
    kind === 'robot'
      ? DEFAULT_VOICES.robot
      : kind === 'female'
        ? DEFAULT_VOICES.female
        : DEFAULT_VOICES.male;
  const gender = kind === 'female' ? 'female' : 'male';
  const rank = (voice) => (voice.id === preferred ? 0 : voice.gender === gender ? 1 : 2);
  return [...VOICES].sort((a, b) => rank(a) - rank(b));
}
