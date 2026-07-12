import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateStorageStatePath } from './sessionState';

describe('validateStorageStatePath', () => {
  it('accepts a Playwright storage-state object and returns an absolute path', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'carddata-session-'));
    const statePath = path.join(directory, 'state.json');
    await writeFile(statePath, JSON.stringify({ cookies: [], origins: [] }));

    await expect(validateStorageStatePath(statePath)).resolves.toBe(path.resolve(statePath));
  });

  it('reports an unreadable path clearly', async () => {
    const missingPath = path.join(tmpdir(), 'missing-carddata-storage-state.json');

    await expect(validateStorageStatePath(missingPath)).rejects.toThrow(
      /Cannot read Playwright storage-state file/
    );
  });

  it('rejects malformed JSON', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'carddata-session-'));
    const statePath = path.join(directory, 'state.json');
    await writeFile(statePath, '{not-json');

    await expect(validateStorageStatePath(statePath)).rejects.toThrow(
      /Invalid JSON in Playwright storage-state file/
    );
  });

  it('rejects JSON that is not Playwright storage state', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'carddata-session-'));
    const statePath = path.join(directory, 'state.json');
    await writeFile(statePath, JSON.stringify({ cookies: [] }));

    await expect(validateStorageStatePath(statePath)).rejects.toThrow(
      /expected an object with cookies and origins arrays/
    );
  });
});
