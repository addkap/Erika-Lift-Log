// Pure helpers for editing a workout template (Lower / Upper / Full). Each returns a NEW template
// with a fresh updatedAt, so the change syncs like any other edit. Templates only ever list
// exercises: removing one here never touches the exercise itself or any saved workout.

import type { DraftEntry, Exercise, Template, TemplateItem } from '../types';

export const DEFAULT_MIN_SETS = 2;
export const DEFAULT_MAX_SETS = 3;

const touch = (t: Template, items: TemplateItem[], now: number): Template => ({ ...t, items, updatedAt: now });

/** An exercise that can appear in a new workout (it exists, is not deleted, and is not archived). */
export const isUsable = (e: Exercise | undefined): e is Exercise => !!e && !e.deletedAt && !e.archived;

/** The template's items that will really show up in a workout, in order. */
export function visibleItems(t: Template, exercises: Exercise[]): TemplateItem[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return t.items.filter((i) => isUsable(byId.get(i.exerciseId)));
}

export function addItem(t: Template, exerciseId: string, now = Date.now(), min = DEFAULT_MIN_SETS, max = DEFAULT_MAX_SETS): Template {
  if (t.items.some((i) => i.exerciseId === exerciseId)) return t;
  return touch(t, [...t.items, { exerciseId, minSets: min, maxSets: max }], now);
}

export function removeItem(t: Template, exerciseId: string, now = Date.now()): Template {
  return touch(t, t.items.filter((i) => i.exerciseId !== exerciseId), now);
}

/** Move an exercise up or down past its next VISIBLE neighbour (hidden archived ones are hopped over). */
export function moveItem(
  t: Template,
  exerciseId: string,
  dir: -1 | 1,
  isVisible: (exerciseId: string) => boolean = () => true,
  now = Date.now(),
): Template {
  const i = t.items.findIndex((x) => x.exerciseId === exerciseId);
  if (i < 0) return t;
  let j = i + dir;
  while (j >= 0 && j < t.items.length && !isVisible(t.items[j].exerciseId)) j += dir;
  if (j < 0 || j >= t.items.length) return t;
  const items = [...t.items];
  [items[i], items[j]] = [items[j], items[i]];
  return touch(t, items, now);
}

/** Recommended set range. Whole numbers, at least 1, and the maximum is never below the minimum. */
export function setRange(t: Template, exerciseId: string, min: number, max: number, now = Date.now()): Template {
  const lo = Math.max(1, Math.round(min) || 1);
  const hi = Math.max(lo, Math.round(max) || lo);
  return touch(t, t.items.map((i) => (i.exerciseId === exerciseId ? { ...i, minSets: lo, maxSets: hi } : i)), now);
}

export function renameTemplate(t: Template, name: string, now = Date.now()): Template {
  const clean = name.trim();
  if (!clean || clean === t.name) return t;
  return { ...t, name: clean, updatedAt: now };
}

/** Is the list of exercises in this (in-progress) workout the same, in the same order, as the template? */
export function draftMatchesTemplate(t: Template, entries: Pick<DraftEntry, 'exerciseId'>[], exercises: Exercise[]): boolean {
  const a = visibleItems(t, exercises).map((i) => i.exerciseId);
  const b = entries.map((e) => e.exerciseId);
  return a.length === b.length && a.every((id, k) => id === b[k]);
}

/**
 * Make the template match an in-progress workout: same exercises, same order. Set ranges the template
 * already had are kept; new ones use the card's range. Archived items are kept at the end, so
 * restoring an archived exercise brings it back.
 */
export function templateFromDraft(t: Template, entries: DraftEntry[], exercises: Exercise[], now = Date.now()): Template {
  const old = new Map(t.items.map((i) => [i.exerciseId, i]));
  const seen = new Set<string>();
  const items: TemplateItem[] = [];
  for (const e of entries) {
    if (seen.has(e.exerciseId)) continue;
    seen.add(e.exerciseId);
    items.push(old.get(e.exerciseId) ?? { exerciseId: e.exerciseId, minSets: e.minSets, maxSets: e.maxSets });
  }
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const i of t.items) {
    const ex = byId.get(i.exerciseId);
    if (!seen.has(i.exerciseId) && ex && ex.archived && !ex.deletedAt) items.push(i);
  }
  return touch(t, items, now);
}

/** Case-insensitive name clash with another usable exercise (so two exercises are never both "Plank"). */
export function nameTaken(exercises: Exercise[], name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase();
  return exercises.some((e) => !e.deletedAt && !e.archived && e.id !== exceptId && e.name.trim().toLowerCase() === n);
}
