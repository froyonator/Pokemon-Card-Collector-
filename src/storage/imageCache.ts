const DB_NAME = 'pcc-image-cache';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

interface StoredImage {
  buffer: ArrayBuffer;
  type: string;
}

// Blob.prototype.arrayBuffer() is unavailable in some DOM test environments
// (notably jsdom, which implements Blob without it). Fall back to FileReader,
// which is universally supported, so the same code path works in real
// browsers and under test.
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function getCachedImage(url: string): Promise<Blob | undefined> {
  const db = await openDb();
  const stored = await new Promise<StoredImage | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(url);
    req.onsuccess = () => resolve(req.result as StoredImage | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!stored) return undefined;
  return new Blob([stored.buffer], { type: stored.type });
}

export async function setCachedImage(url: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const buffer = await blobToArrayBuffer(blob);
  const stored: StoredImage = { buffer, type: blob.type };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(stored, url);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function fetchImageWithCache(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const cached = await getCachedImage(url);
  if (cached) {
    return URL.createObjectURL(cached);
  }
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(`Image request failed with status ${res.status}`);
  }
  const blob = await res.blob();
  await setCachedImage(url, blob);
  return URL.createObjectURL(blob);
}
