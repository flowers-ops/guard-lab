export function selectEnglishVoice(voices, voiceId, actor) {
  const english = voices.filter((v) => /^en(?:[-_]|$)/i.test(v.lang));
  const female = actor === 'robot' || /amy|lessac|female/i.test(voiceId || '');
  const preferred = female
    ? /zira|samantha|victoria|karen|moira|female|hazel|susan|aria/i
    : /david|alex|daniel|mark|(?:^|\W)male(?:$|\W)|guy|ryan/i;
  return (
    (voiceId?.startsWith('native:') && english.find((v) => v.name === voiceId.slice(7))) ||
    english.find((v) => preferred.test(v.name)) ||
    english[0] ||
    null
  );
}

export async function nativeSpeech(text, voiceId, actor, onPlayback) {
  const synthesis = window.speechSynthesis;
  if (!synthesis) throw new Error('Install local Piper voices: npm run voices:install.');
  if (!synthesis.getVoices().length) {
    await new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        synthesis.removeEventListener('voiceschanged', finish);
        resolve();
      };
      const timer = setTimeout(finish, 1500);
      synthesis.addEventListener('voiceschanged', finish);
    });
  }
  const voice = selectEnglishVoice(synthesis.getVoices(), voiceId, actor);
  if (!voice)
    throw new Error(
      'No English system voice is installed. Install English local voices: npm run voices:install.',
    );
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Install local Piper voices: npm run voices:install.'));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
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
      window.speechSynthesis.cancel();
      finish();
    }, 90000);
    onPlayback?.({
      finish: () => {
        window.speechSynthesis.cancel();
        finish();
      },
    });
    utterance.onend = () => finish();
    utterance.onerror = (event) =>
      finish(
        event.error !== 'canceled' && event.error !== 'interrupted'
          ? new Error('No system English voice. Install local voices: npm run voices:install.')
          : null,
      );
    window.speechSynthesis.speak(utterance);
  });
}
