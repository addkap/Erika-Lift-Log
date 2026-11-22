// Local database (IndexedDB via Dexie). This is the source of truth for the app.
import Dexie, { type Table } from 'dexie';
import { DB_NAME } from './appIdentity';
import { normalizeExercise, normalizeTemplate } from './lib/model';
import type { Draft, Exercise, SyncMeta, Template, Workout } from './types';

class LiftDB extends Dexie {
  exercises!: Table<Exercise, string>;
  templates!: Table<Template, string>;
  workouts!: Table<Workout, string>;
  drafts!: Table<Draft, string>;
  meta!: Table<SyncMeta, string>;

  constructor() {
    super(DB_NAME);
    // Only indexed fields are listed here; other fields are stored automatically.
    this.version(1).stores({
      exercises: 'id',
      templates: 'id',
      workouts: 'id, date, updatedAt',
      drafts: 'id',
    });
    // Version 2 adds the OneDrive sync settings table.
    this.version(2).stores({
      exercises: 'id',
      templates: 'id',
      workouts: 'id, date, updatedAt',
      drafts: 'id',
      meta: 'id',
    });
    // Version 3 adds exercise kinds, notes, auto-increase settings and template names to older rows.
    // No new indexes; this only fills in the missing fields.
    this.version(3)
      .stores({
        exercises: 'id',
        templates: 'id',
        workouts: 'id, date, updatedAt',
        drafts: 'id',
        meta: 'id',
      })
      .upgrade(async (tx) => {
        await tx.table('exercises').toCollection().modify((e) => Object.assign(e, normalizeExercise(e)));
        await tx.table('templates').toCollection().modify((t) => Object.assign(t, normalizeTemplate(t)));
        // A workout in progress from before this version: give its rows a seconds box and a kind.
        await tx.table('drafts').toCollection().modify((d) => {
          for (const e of d.entries ?? []) {
            e.kind = e.kind ?? 'weightReps';
            e.notes = e.notes ?? '';
            for (const r of e.rows ?? []) r.seconds = r.seconds ?? '';
          }
        });
      });
  }
}

export const db = new LiftDB();
