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

// jsdom does not implement ResizeObserver at all (unlike the gaps above,
// there's no partial browser implementation to extend). BinderView measures
// its .spread container with one to compute real pixel slot sizes (see
// src/state/binderSlotSizing.ts), so every test that renders BinderView --
// directly or via DexGrid's Binder view -- needs this stubbed with a
// nonzero size, or the measurement effect throws.
// jsdom's AbortSignal implementation predates the AbortSignal.any()/
// AbortSignal.timeout() static methods (both broadly supported in real
// browsers and in Node itself since 2022-2023) -- polyfill minimal,
// spec-shaped versions so code under test (src/api/tcgdex.ts's
// composeSignalWithTimeout) can compose a caller-supplied signal with a
// request timeout exactly as it does in production, instead of throwing
// "AbortSignal.timeout is not a function" the moment any fetch call runs.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    }, ms);
    return controller.signal;
  };
}

if (typeof AbortSignal.any !== 'function') {
  AbortSignal.any = (signals: AbortSignal[]): AbortSignal => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class MockResizeObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe() {
      this.callback(
        [{ contentRect: { width: 900, height: 600 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}
