import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizeImageForUpload } from './imageResize';

// jsdom implements neither createImageBitmap nor a real <canvas> 2D
// context (see this file's own comment in imageResize.ts), so these tests
// stub both browser APIs at the boundary to exercise the real function's
// resize math and its call wiring into canvas, rather than fighting jsdom
// to render an actual bitmap.
describe('resizeImageForUpload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('downscales to a 600px max edge preserving aspect ratio, and re-encodes as JPEG at 0.82 quality', async () => {
    const fakeBitmap = { width: 1200, height: 600 } as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap));

    const drawImage = vi.fn();
    const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,FAKE');
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage }),
      toDataURL,
    };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas as never);

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    const result = await resizeImageForUpload(file);

    expect(fakeCanvas.width).toBe(600);
    expect(fakeCanvas.height).toBe(300);
    expect(drawImage).toHaveBeenCalledWith(fakeBitmap, 0, 0, 600, 300);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(result).toBe('data:image/jpeg;base64,FAKE');
  });

  it('does not upscale an image already smaller than the 600px max edge', async () => {
    const fakeBitmap = { width: 300, height: 150 } as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap));

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,SMALL'),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas as never);

    const file = new File([new Uint8Array([1])], 'small.jpg', { type: 'image/jpeg' });
    await resizeImageForUpload(file);

    expect(fakeCanvas.width).toBe(300);
    expect(fakeCanvas.height).toBe(150);
  });

  it('throws when a 2D canvas context is unavailable', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 100, height: 100 }));
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(fakeCanvas as never);

    const file = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' });
    await expect(resizeImageForUpload(file)).rejects.toThrow('Canvas 2D context unavailable.');
  });
});
