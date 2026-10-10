// System speech (speechSynthesis) fallback used when the local Kokoro voices are not installed.
import { voiceInfo } from '../../shared/voice-catalog.mjs';

const INSTALL_HINT = 'Install Kokoro voices in Settings for local speech.';

export function selectEnglishVoice(voices, voiceId, actor) {
  const english = voices.filter((v) => /^en(?:[-_]|$)/i.test(v.lang));
  const info = voiceInfo(voiceId);
  // The guard defaults to a British male voice; legacy ids keep their old gender.
  const female = info
    ? info.gender === 'female'
    : /amy|female|kokoro:[ab]f_/i.test(voiceId || '') ||
      (actor === 'robot' && /lessac/i.test(voiceId || ''));
  const preferred = female
    ? /zira|samantha|victoria|karen|moira|female|hazel|susan|aria|serena|kate/i
    : /daniel|david|alex|mark|(?:^|\W)male(?:$|\W)|guy|ryan|george|arthur|oliver/i;
  return (
    (voiceId?.startsWith('native:') && english.find((v) => v.name === voiceId.slice(7))) ||
    english.find((v) => preferred.test(v.name)) ||
    english[0] ||
    null
  );
}

export async function nativeSpeech(text, voiceId, actor, onPlayback, onStarted) {
  const synthesis = globalThis.window?.speechSynthesis;
  if (!synthesis) throw new Error('Speech is unavailable. ' + INSTALL_HINT);
  if (!synthesis.getVoices().length) {
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        synthesis.removeEventListener?.('voiceschanged', finish);
        resolve();
      };
      const timer = setTimeout(finish, 1500);
      synthesis.addEventListener?.('voiceschanged', finish);
    });
  }
  const voice = selectEnglishVoice(synthesis.getVoices(), voiceId, actor);
  if (!voice) throw new Error('No English system voice is installed. ' + INSTALL_HINT);
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice.lang || 'en-US';
    utterance.voice = voice;
    let ended = false;
    const finish = (error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      synthesis.cancel();
      finish();
    }, 90000);
    onPlayback?.({
      finish: () => {
        synthesis.cancel();
        finish();
      },
    });
    utterance.onend = () => finish();
    utterance.onstart = () => onStarted?.();
    utterance.onerror = (event) =>
      finish(
        event.error !== 'canceled' && event.error !== 'interrupted'
          ? new Error('System speech failed. ' + INSTALL_HINT)
          : null,
      );
    synthesis.speak(utterance);
  });
}
