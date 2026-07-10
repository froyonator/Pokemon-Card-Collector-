import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom does not implement URL.createObjectURL/revokeObjectURL (see
// https://github.com/jsdom/jsdom/issues/1721). Polyfill with an in-memory
// blob: URL registry so code under test can exercise the real Web API shape.
if (typeof URL.createObjectURL !== 'function') {
  const objectUrls = new Map<string, Blob>();
  let counter = 0;
  URL.createObjectURL = (blob: Blob): string => {
    const url = `blob:mock-${++counter}`;
    objectUrls.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    objectUrls.delete(url);
  };
}

// jsdom's Blob/File implementation does not include the .text()/.arrayBuffer()
// methods from the Blob spec (see https://github.com/jsdom/jsdom/issues/2555,
// still open as of jsdom 25). File extends Blob, so this also covers reading
// uploaded files (e.g. via userEvent.upload) with `await file.text()`.
// FileReader, unlike text()/arrayBuffer(), is implemented by jsdom, so it's
// used here to polyfill the missing method rather than reimplementing parsing.
if (typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
