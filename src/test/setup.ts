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
