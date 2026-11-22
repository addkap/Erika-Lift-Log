import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as mine from './appIdentity';
import { LIFT_LOG_NAMES as theirs } from './appIdentity';
import { DATA_FILE_NAME as configFileName } from './config';
import { installStorageNamespace } from './installStorageNamespace';
import { RETURN_TAB_KEY } from './sync/auth';

// Lift Log (the original app) and this app are on the same website, so they share the browser's storage.
// These checks prove every name this app uses is different from Lift Log's.

describe('this app does not collide with Lift Log', () => {
  it('uses its own database name', () => {
    expect(mine.DB_NAME).not.toBe(theirs.dbName);
  });
  it('uses its own localStorage keys', () => {
    expect(mine.RETURN_TAB_KEY).not.toBe(theirs.returnTabKey);
    expect(mine.SYNC_FOLDER_KEY).not.toBe(theirs.syncFolderKey);
    expect(RETURN_TAB_KEY).toBe(mine.RETURN_TAB_KEY); // the code really uses the names above
  });
  it('puts every localStorage key, including the Microsoft sign-in cache, behind its own prefix', () => {
    expect(mine.STORAGE_PREFIX).not.toBe('');
    expect(mine.STORAGE_PREFIX.startsWith(theirs.msalPrefix)).toBe(false);
    expect(`${mine.STORAGE_PREFIX}msal.2.token.keys.x`).not.toBe('msal.2.token.keys.x');
    expect(`${mine.BROADCAST_PREFIX}${theirs.broadcastChannel}`).not.toBe(theirs.broadcastChannel);
  });
  it('uses its own OneDrive file name and data tag, so neither app reads the other’s file', () => {
    expect(mine.DATA_FILE_NAME).not.toBe(theirs.dataFileName);
    expect(configFileName).toBe(mine.DATA_FILE_NAME);
    expect(mine.SYNC_APP_TAG).not.toBe(theirs.syncAppTag);
    expect(mine.BACKUP_FILE_PREFIX).not.toBe(theirs.backupFilePrefix);
  });
  it('names its offline cache after itself', () => {
    expect(mine.SW_CACHE_ID).toBeTruthy();
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('cacheId: SW_CACHE_ID');
  });
  it('is served from its own address, so its service worker scope is its own', () => {
    // The scope comes from the site's sub-path, which the deploy workflow takes from the repository name.
    const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
    expect(workflow).toContain('VITE_BASE: /${{ github.event.repository.name }}/');
    expect(readFileSync('vite.config.ts', 'utf8')).toMatch(/scope: base/);
  });
  it('no source file still hard-codes one of Lift Log’s names', () => {
    const files = ['src/db.ts', 'src/config.ts', 'src/sync/auth.ts', 'src/sync/meta.ts', 'src/sync/merge.ts', 'src/sync/local.ts', 'src/components/BackupSettings.tsx'];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/'lift-log'|'lift-return-tab'|'lift-sync-folder'|lift-log-data\.json|lift-log-backup/);
    }
  });
});

describe('private storage is switched on at start-up', () => {
  it('main.tsx loads it before anything else', () => {
    const lines = readFileSync('src/main.tsx', 'utf8').split('\n').filter((l) => l.startsWith('import'));
    expect(lines[0]).toContain('installStorageNamespace');
  });
  it('wraps a window’s localStorage once, with the app prefix', () => {
    const real = new Map<string, string>();
    const storage = {
      get length() { return real.size; },
      key: (i: number) => [...real.keys()][i] ?? null,
      getItem: (k: string) => real.get(k) ?? null,
      setItem: (k: string, v: string) => { real.set(k, v); },
      removeItem: (k: string) => { real.delete(k); },
      clear: () => real.clear(),
    };
    const fakeStorage = new Proxy(storage, { ownKeys: () => [...real.keys()], getOwnPropertyDescriptor: (_t, p) => (typeof p === 'string' && real.has(p) ? { value: real.get(p), enumerable: true, configurable: true, writable: true } : undefined) });
    const win = { localStorage: fakeStorage, BroadcastChannel: class { constructor(public name: string) {} } } as unknown as Window & typeof globalThis;
    expect(installStorageNamespace(win)).toBe(true);
    win.localStorage.setItem('msal.x', '1');
    expect([...real.keys()]).toEqual([`${mine.STORAGE_PREFIX}msal.x`]);
    expect(installStorageNamespace(win)).toBe(true); // second call does not wrap again
    win.localStorage.setItem('y', '2');
    expect([...real.keys()].sort()).toEqual([`${mine.STORAGE_PREFIX}msal.x`, `${mine.STORAGE_PREFIX}y`]);
    expect((new win.BroadcastChannel('msal.broadcast.cache') as unknown as { name: string }).name).toBe(`${mine.BROADCAST_PREFIX}msal.broadcast.cache`);
    expect((new win.BroadcastChannel('other') as unknown as { name: string }).name).toBe('other');
  });
});
