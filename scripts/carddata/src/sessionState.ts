import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const STORAGE_STATE_ENV_VAR = 'CARD_DATA_STORAGE_STATE';

type StorageStateShape = {
  cookies: unknown[];
  origins: unknown[];
};

function isStorageStateShape(value: unknown): value is StorageStateShape {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.cookies) && Array.isArray(candidate.origins);
}

/**
 * Resolve and validate a Playwright storage-state file before launching Chromium.
 * The cookie values remain in the file and are never logged.
 */
export async function validateStorageStatePath(inputPath: string): Promise<string> {
  const trimmedPath = inputPath.trim();
  if (!trimmedPath) {
    throw new Error('The Playwright storage-state path is empty.');
  }

  const resolvedPath = path.resolve(trimmedPath);
  let contents: string;
  try {
    contents = await readFile(resolvedPath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read Playwright storage-state file at ${resolvedPath}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in Playwright storage-state file at ${resolvedPath}: ${detail}`);
  }

  if (!isStorageStateShape(parsed)) {
    throw new Error(
      `Invalid Playwright storage-state file at ${resolvedPath}: expected an object with cookies and origins arrays.`
    );
  }

  return resolvedPath;
}
