export function speechSegments(text) {
  if (text.length <= 240) return [text];
  const first = text.match(/^.{40,180}?[.!?;](?=\s)/s)?.[0];
  const boundary = first?.length || text.lastIndexOf(' ', 160);
  if (boundary <= 0) return [text];
  return [text.slice(0, boundary), text.slice(boundary).trimStart()].filter(Boolean);
}
export function prepareVoice(desktop, text, voice, actor) {
  const tasks = speechSegments(text).map((segment) => {
    const task = desktop.synthesize({ text: segment, voice, actor });
    task.catch(() => {});
    return task;
  });
  return tasks[0].then((first) => ({ ...first, following: tasks.slice(1) }));
}
