export function submitSpeechOnEnter(event) {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.nativeEvent?.isComposing ||
    event.isComposing ||
    event.repeat
  )
    return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
