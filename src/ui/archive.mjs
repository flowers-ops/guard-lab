// Async browser-local storage keeps large turn records off the render path.
let opening;
const known = new Map();
function database() {
  return (opening ||= new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Local archive storage is unavailable.'));
    const request = indexedDB.open('guard-lab-archive', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('runs', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
const completion = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Archive save interrupted.'));
  });
export async function loadArchive() {
  const db = await database(),
    tx = db.transaction('runs', 'readonly');
  const request = tx.objectStore('runs').getAll();
  const records = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const record of records) known.set(record.id, record);
  return records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function saveArchive(records) {
  const db = await database(),
    tx = db.transaction('runs', 'readwrite'),
    store = tx.objectStore('runs');
  const next = new Map(
    records.filter((r) => !r.id.startsWith('guard-all-tools-showcase-')).map((r) => [r.id, r]),
  );
  for (const [id, record] of next) if (known.get(id) !== record) store.put(record);
  for (const id of known.keys()) if (!next.has(id)) store.delete(id);
  await completion(tx);
  known.clear();
  for (const [id, record] of next) known.set(id, record);
}
