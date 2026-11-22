// Every name this app uses to store things in the browser or in OneDrive, in ONE place.
//
// Lift Log (the original app) lives on the same website (addkap.github.io) and the browser shares
// storage between all pages of a website, so none of these names may match Lift Log's.
// src/appIdentity.test.ts checks that they do not.

/** The IndexedDB database that holds exercises, workouts and drafts. */
export const DB_NAME = 'erika-lift-log';

/**
 * Added in front of EVERY localStorage key this page reads or writes (see installStorageNamespace.ts).
 * That includes the Microsoft sign-in (MSAL) cache, whose key names cannot be changed any other way.
 */
export const STORAGE_PREFIX = 'erika-lift-log:';

/** Name prefix for the cross-tab channel the Microsoft sign-in library uses (so tabs of the two apps do not talk). */
export const BROADCAST_PREFIX = 'erika-lift-log:';

/** Which tab to reopen after coming back from the Microsoft sign-in page. */
export const RETURN_TAB_KEY = 'erika-return-tab';

/** A second copy of the OneDrive folder choice (survives a wiped database). */
export const SYNC_FOLDER_KEY = 'erika-sync-folder';

/** The only file this app reads or writes in the OneDrive folder. */
export const DATA_FILE_NAME = 'erika-lift-log-data.json';

/** Written inside the data file and backups so this app refuses files from other apps (and the reverse). */
export const SYNC_APP_TAG = 'erika-lift-log';

/** Backup downloads are named erika-lift-log-backup-<date>.json. */
export const BACKUP_FILE_PREFIX = 'erika-lift-log-backup-';

/** Names the offline file cache, so this app's cache is never confused with another app's. */
export const SW_CACHE_ID = 'erika-lift-log';

/** What the ORIGINAL Lift Log app uses. Only the test reads this, to prove none of ours match. */
export const LIFT_LOG_NAMES = {
  dbName: 'lift-log',
  returnTabKey: 'lift-return-tab',
  syncFolderKey: 'lift-sync-folder',
  dataFileName: 'lift-log-data.json',
  syncAppTag: 'lift-log',
  backupFilePrefix: 'lift-log-backup-',
  swCacheId: undefined, // Lift Log uses Workbox's default cache names
  msalPrefix: 'msal.', // hard-coded inside the Microsoft library; shared by every app on the site unless prefixed
  broadcastChannel: 'msal.broadcast.cache',
} as const;
