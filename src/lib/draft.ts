// Pure helpers for editing the in-progress workout. Each returns a NEW draft
// (nothing is mutated), which makes them easy to test and safe to autosave.

import type { Draft, DraftEntry, DraftRow, Exercise, ExerciseKind, SetRecord, Template, Workout, WorkoutType } from '../types';
import { newId } from './ids';
import { entryKind } from './model';
import { hintFor } from './progression';

/** Keep only characters that make sense in a number box. */
export function sanitizeNumber(raw: string, allowDecimal: boolean): string {
  let out = raw.replace(/,/g, '.').replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (allowDecimal) {
    const dot = out.indexOf('.');
    if (dot >= 0) out = out.slice(0, dot + 1) + out.slice(dot + 1).replace(/\./g, '');
  }
  return out;
}

export function parseNumber(text: string): number {
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

export function makeRows(count: number, weight: string): DraftRow[] {
  return Array.from({ length: count }, () => ({ weight, reps: '', seconds: '' }));
}

export function newEntry(
  ex: Pick<Exercise, 'id' | 'name'> & Partial<Pick<Exercise, 'kind' | 'notes'>>,
  minSets: number,
  maxSets: number,
  weight: string,
  startWeight?: string,
): DraftEntry {
  return {
    key: newId(),
    exerciseId: ex.id,
    name: ex.name,
    kind: ex.kind ?? 'weightReps',
    notes: ex.notes ?? '',
    minSets,
    maxSets,
    startWeight,
    rows: makeRows(minSets, weight),
  };
}

/** Build a fresh draft from a template: default order, minimum sets, weights prefilled. */
export function buildDraft(
  type: WorkoutType,
  date: string,
  template: Template,
  exercises: Exercise[],
  workouts: Workout[],
  now = Date.now(),
): Draft {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const entries: DraftEntry[] = [];
  for (const item of template.items) {
    const ex = byId.get(item.exerciseId);
    if (!ex || ex.deletedAt || ex.archived) continue; // archived exercises stay in history but not in new workouts
    entries.push(newEntry(ex, item.minSets, item.maxSets, hintFor(workouts, ex).weight));
  }
  return { id: 'current', type, typeName: template.name, date, entries, updatedAt: now };
}

function mapEntry(d: Draft, key: string, fn: (e: DraftEntry) => DraftEntry): Draft {
  return { ...d, entries: d.entries.map((e) => (e.key === key ? fn(e) : e)) };
}

export function setCell(d: Draft, key: string, rowIndex: number, field: 'weight' | 'reps' | 'seconds', value: string): Draft {
  return mapEntry(d, key, (e) => ({
    ...e,
    rows: e.rows.map((r, i) => (i === rowIndex ? { ...r, [field]: value } : r)),
  }));
}

/** New set row copies the weight of the previous row (the usual next set). */
export function addRow(d: Draft, key: string): Draft {
  return mapEntry(d, key, (e) => {
    const prev = e.rows[e.rows.length - 1];
    return { ...e, rows: [...e.rows, { weight: prev ? prev.weight : '', reps: '', seconds: '' }] };
  });
}

/** Remove the last set row, but always keep at least one. */
export function removeLastRow(d: Draft, key: string): Draft {
  return mapEntry(d, key, (e) => (e.rows.length > 1 ? { ...e, rows: e.rows.slice(0, -1) } : e));
}

export function moveEntry(d: Draft, key: string, dir: -1 | 1): Draft {
  const i = d.entries.findIndex((e) => e.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= d.entries.length) return d;
  const entries = [...d.entries];
  [entries[i], entries[j]] = [entries[j], entries[i]];
  return { ...d, entries };
}

/** Skip an exercise for today only. The template is never touched. */
export function removeEntry(d: Draft, key: string): Draft {
  return { ...d, entries: d.entries.filter((e) => e.key !== key) };
}

export function addEntry(d: Draft, entry: DraftEntry): Draft {
  return { ...d, entries: [...d.entries, entry] };
}

/** Does this entry have any reps typed in? (Used to decide whether to confirm a removal.) */
export function entryHasData(e: DraftEntry): boolean {
  return e.rows.some(rowLogged(e.kind));
}

/** Which rows count: a timed hold needs seconds, everything else needs reps. */
const rowLogged = (kind: ExerciseKind) => (r: DraftRow) =>
  parseNumber(kind === 'timedHold' ? r.seconds : r.reps) > 0;

/** Turn one typed row into the number(s) we save. Weight is only kept for weight + reps. */
function rowToSet(kind: ExerciseKind, r: DraftRow): SetRecord {
  if (kind === 'timedHold') return { weight: 0, reps: 0, seconds: parseNumber(r.seconds) };
  if (kind === 'repsOnly') return { weight: 0, reps: parseNumber(r.reps) };
  return { weight: parseNumber(r.weight), reps: parseNumber(r.reps) };
}

/**
 * Turn the draft into a saved workout. Rows with no reps are ignored, and exercises
 * with no sets are left out. Returns null if nothing at all was logged.
 */
export function draftToWorkout(d: Draft, now = Date.now()): Workout | null {
  const entries = d.entries
    .map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      kind: e.kind,
      sets: e.rows.filter(rowLogged(e.kind)).map((r) => rowToSet(e.kind, r)),
    }))
    .filter((e) => e.sets.length > 0);
  if (entries.length === 0) return null;
  return { id: newId(), date: d.date, type: d.type, ...(d.typeName ? { typeName: d.typeName } : {}), entries, createdAt: now, updatedAt: now };
}

// ---- Editing an already-saved workout (History page) ----
// We reuse the draft helpers above: a saved workout is turned into a draft, edited,
// then turned back into a workout with the same id.

export function workoutToDraft(w: Workout): Draft {
  return {
    id: 'current',
    type: w.type,
    typeName: w.typeName,
    date: w.date,
    updatedAt: w.updatedAt,
    entries: w.entries.map((e) => ({
      key: newId(),
      exerciseId: e.exerciseId,
      name: e.name,
      kind: entryKind(e),
      notes: '',
      minSets: e.sets.length,
      maxSets: e.sets.length,
      rows: e.sets.map((s) => ({
        weight: String(s.weight),
        reps: String(s.reps),
        seconds: s.seconds ? String(s.seconds) : '',
      })),
    })),
  };
}

/** Save edits onto the original workout (same id and createdAt). Null if no sets remain. */
export function applyDraftToWorkout(original: Workout, d: Draft, now = Date.now()): Workout | null {
  const edited = draftToWorkout(d, now);
  if (!edited) return null;
  return { ...original, date: d.date, entries: edited.entries, updatedAt: now };
}

/** Deleting leaves a tombstone (so the deletion can sync) instead of removing the record. */
export function markDeleted(w: Workout, now = Date.now()): Workout {
  return { ...w, deletedAt: now, updatedAt: now };
}
