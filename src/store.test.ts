import 'fake-indexeddb/auto'; // must come first: gives Dexie an in-memory IndexedDB for tests
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { addRow, removeEntry, setCell } from './lib/draft';
import { SAMPLE_EXERCISES, SAMPLE_TEMPLATES } from './lib/testFixtures';
import { addCustomExercise, createExercise, discardDraft, ensureSeeded, finishWorkout, loadDraft, saveDraft, saveDraftAsDefault, saveExercise, setArchived, setIncrement, startWorkout, updateTemplate } from './store';
import { addItem, moveItem, removeItem } from './lib/templates';
import type { Draft } from './types';

beforeEach(async () => {
  await Promise.all([db.exercises.clear(), db.templates.clear(), db.workouts.clear(), db.drafts.clear()]);
  await ensureSeeded();
  // The real app starts empty; most tests want a realistic set of workouts to work with.
  await db.exercises.bulkPut(SAMPLE_EXERCISES);
  await db.templates.bulkPut(SAMPLE_TEMPLATES);
});

describe('store', () => {
  it('starts with three empty, named workouts and no exercises', async () => {
    await Promise.all([db.exercises.clear(), db.templates.clear()]);
    await ensureSeeded();
    await ensureSeeded(); // safe to repeat
    expect(await db.exercises.count()).toBe(0);
    const templates = await db.templates.toArray();
    expect(templates.map((t) => t.id).sort()).toEqual(['full', 'lower', 'upper']);
    expect(templates.every((t) => t.items.length === 0 && t.name.length > 0)).toBe(true);
  });

  it('autosaves the draft and finishing saves a workout and clears the draft', async () => {
    let d = await startWorkout('lower', '2026-11-21');
    d = setCell(d, d.entries[0].key, 0, 'weight', '120');
    d = setCell(d, d.entries[0].key, 0, 'reps', '12');
    await saveDraft(d);
    expect((await loadDraft())!.entries[0].rows[0].reps).toBe('12'); // survives a "browser close"

    const w = await finishWorkout(d);
    expect(w).not.toBeNull();
    expect(await db.workouts.count()).toBe(1);
    expect(await loadDraft()).toBeUndefined();
  });

  it('finishing with no reps saves nothing', async () => {
    const d = await startWorkout('upper', '2026-11-21');
    expect(await finishWorkout(d)).toBeNull();
    expect(await db.workouts.count()).toBe(0);
    expect(await loadDraft()).toBeDefined();
  });

  it('removing an exercise from today leaves the template alone', async () => {
    let d = await startWorkout('lower', '2026-11-21');
    d = removeEntry(d, d.entries[0].key);
    expect(d.entries).toHaveLength(4);
    expect((await db.templates.get('lower'))!.items).toHaveLength(5);
  });

  it('custom exercise for today only: tracked, but not added to the template', async () => {
    let d = await startWorkout('lower', '2026-11-21');
    d = await addCustomExercise(d, { name: 'Leg press', startWeight: '90', keep: false });
    const entry = d.entries[d.entries.length - 1];
    expect(entry.rows[0].weight).toBe('90');
    expect((await db.templates.get('lower'))!.items).toHaveLength(5);
    expect(await db.exercises.get(entry.exerciseId)).toBeDefined();
  });

  it('custom exercise with "keep going forward" joins the template', async () => {
    let d = await startWorkout('lower', '2026-11-21');
    d = await addCustomExercise(d, { name: 'Leg press', startWeight: '90', keep: true });
    const items = (await db.templates.get('lower'))!.items;
    expect(items).toHaveLength(6);
    expect(items[5].exerciseId).toBe(d.entries[5].exerciseId);
  });

  it('a custom exercise named like an existing one shares its history', async () => {
    let d = await startWorkout('upper', '2026-11-21');
    d = await addCustomExercise(d, { name: 'hack SQUAT', startWeight: '', keep: false });
    expect(d.entries[d.entries.length - 1].exerciseId).toBe('hack-squat');
    expect(await db.exercises.count()).toBe(11);
  });

  it('next workout uses the saved history and the exercise increment', async () => {
    await setIncrement('hack-squat', 2.5);
    let d = await startWorkout('lower', '2026-11-08');
    const key = d.entries[0].key;
    d = addRow(d, key); // 4 sets; fine
    for (const [i, reps] of ['12', '12', '12'].entries()) {
      d = setCell(d, key, i, 'weight', '120');
      d = setCell(d, key, i, 'reps', reps);
    }
    await finishWorkout(d);
    const next = await startWorkout('full', '2026-11-15'); // shared exercise carries across types
    expect(next.entries[0].exerciseId).toBe('hack-squat');
    expect(next.entries[0].rows[0].weight).toBe('122.5');
  });
});

describe('exercise kinds and templates (stage 1)', () => {
  it('a timed hold and a reps-only exercise save, reload and keep their kind', async () => {
    let d = await startWorkout('lower', '2026-11-21');
    d = await addCustomExercise(d, { name: 'Wall sit', startWeight: '', keep: false, kind: 'timedHold' });
    d = await addCustomExercise(d, { name: 'Bridges', startWeight: '', keep: false, kind: 'repsOnly' });
    const hold = d.entries[d.entries.length - 2];
    const reps = d.entries[d.entries.length - 1];
    expect(hold.kind).toBe('timedHold');
    d = setCell(d, hold.key, 0, 'seconds', '30');
    d = setCell(d, reps.key, 0, 'reps', '15');
    const w = (await finishWorkout(d))!;
    const saved = (await db.workouts.get(w.id))!;
    expect(saved.entries).toEqual([
      { exerciseId: hold.exerciseId, name: 'Wall sit', kind: 'timedHold', sets: [{ weight: 0, reps: 0, seconds: 30 }] },
      { exerciseId: reps.exerciseId, name: 'Bridges', kind: 'repsOnly', sets: [{ weight: 0, reps: 15 }] },
    ]);
  });

  it('editing a template or exercise does not change a past workout', async () => {
    let d = await startWorkout('lower', '2026-11-08');
    d = setCell(d, d.entries[0].key, 0, 'weight', '120');
    d = setCell(d, d.entries[0].key, 0, 'reps', '12');
    const w = (await finishWorkout(d))!;
    const before = JSON.stringify(await db.workouts.get(w.id));

    await db.exercises.update('hack-squat', { name: 'Leg press', archived: true, notes: 'new cue', updatedAt: 5 });
    await db.templates.update('lower', { name: 'Legs', items: [], updatedAt: 5 });

    expect(JSON.stringify(await db.workouts.get(w.id))).toBe(before);
    expect((await db.workouts.get(w.id))!.typeName).toBe('Lower Body'); // the name it was saved with
    expect((await db.workouts.get(w.id))!.entries[0].name).toBe('Hack squat');
  });

  it('a new workout uses the template name at the time it was started', async () => {
    await db.templates.update('lower', { name: 'Legs and hips', updatedAt: 5 });
    const d = await startWorkout('lower', '2026-11-21');
    expect(d.typeName).toBe('Legs and hips');
  });

  it('archived exercises are left out of new workouts but their history stays', async () => {
    await db.exercises.update('hack-squat', { archived: true, updatedAt: 5 });
    const d = await startWorkout('lower', '2026-11-21');
    expect(d.entries.map((e) => e.exerciseId)).not.toContain('hack-squat');
    expect(d.entries).toHaveLength(4);
    expect((await db.templates.get('lower'))!.items).toHaveLength(5); // still in the template, just skipped
  });

  it('exercise notes are copied onto the workout card', async () => {
    await db.exercises.update('hack-squat', { notes: 'Slow on the way down', updatedAt: 5 });
    const d = await startWorkout('lower', '2026-11-21');
    expect(d.entries[0].notes).toBe('Slow on the way down');
  });
});

describe('editing workouts in the app (stage 2)', () => {
  const logOne = async () => {
    let d = await startWorkout('lower', '2026-11-08');
    d = setCell(d, d.entries[0].key, 0, 'weight', '120');
    d = setCell(d, d.entries[0].key, 0, 'reps', '12');
    return (await finishWorkout(d))!;
  };

  it('builds a workout from nothing: create exercises, order them, and start a workout from them', async () => {
    await Promise.all([db.exercises.clear(), db.templates.clear()]);
    await ensureSeeded(); // empty, like her first run
    const a = await createExercise('upper', { name: 'Band row', kind: 'repsOnly', increment: 5, autoIncrease: false, repGoal: 12, notes: 'Green band' }, { min: 2, max: 3 });
    const b = await createExercise('upper', { name: 'Wall sit', kind: 'timedHold', increment: 5, autoIncrease: false, repGoal: 12, notes: '' }, { min: 3, max: 3 });
    await updateTemplate('upper', (t) => moveItem(t, b.id, -1));
    const d = await startWorkout('upper', '2026-11-21');
    expect(d.entries.map((e) => e.name)).toEqual(['Wall sit', 'Band row']);
    expect(d.entries.map((e) => e.kind)).toEqual(['timedHold', 'repsOnly']);
    expect(d.entries[0].rows).toHaveLength(3);
    expect(d.entries[1].notes).toBe('Green band');
    expect(a.updatedAt).toBeGreaterThan(0); // will sync
  });

  it('editing or removing from a template never changes a past workout', async () => {
    const w = await logOne();
    const before = JSON.stringify(await db.workouts.get(w.id));
    await saveExercise('hack-squat', { name: 'Leg press', notes: 'new', increment: 2.5, autoIncrease: false });
    await updateTemplate('lower', (t) => removeItem(t, 'hack-squat'));
    await updateTemplate('lower', (t) => ({ ...t, name: 'Legs' }));
    expect(JSON.stringify(await db.workouts.get(w.id))).toBe(before);
    expect(await db.exercises.get('hack-squat')).toBeDefined(); // the exercise itself is still there
  });

  it('archiving hides an exercise from new workouts but keeps history, and restoring brings it back', async () => {
    const w = await logOne();
    await setArchived('hack-squat', true);
    expect((await startWorkout('lower', '2026-11-22')).entries.map((e) => e.exerciseId)).not.toContain('hack-squat');
    expect((await db.workouts.get(w.id))!.entries[0].exerciseId).toBe('hack-squat');
    await setArchived('hack-squat', false);
    expect((await startWorkout('lower', '2026-11-23')).entries[0].exerciseId).toBe('hack-squat');
  });

  it('edits are stamped so they sync, and decimal increments are kept', async () => {
    await saveExercise('hack-squat', { increment: 1.25 });
    const ex = (await db.exercises.get('hack-squat'))!;
    expect(ex.increment).toBe(1.25);
    expect(ex.updatedAt).toBeGreaterThan(0);
    await updateTemplate('lower', (t) => addItem(t, 'chest-press'));
    expect((await db.templates.get('lower'))!.updatedAt).toBeGreaterThan(0);
  });

  it('auto-increase off keeps the same weight; the rep goal can be changed', async () => {
    await saveExercise('hack-squat', { autoIncrease: false });
    let d = await startWorkout('lower', '2026-11-08');
    for (let i = 0; i < 3; i++) { d = setCell(d, d.entries[0].key, i, 'weight', '100'); d = setCell(d, d.entries[0].key, i, 'reps', '12'); }
    await finishWorkout(d);
    expect((await startWorkout('lower', '2026-11-15')).entries[0].rows[0].weight).toBe('100');

    await saveExercise('hack-squat', { autoIncrease: true, repGoal: 10, increment: 2.5 });
    await discardDraft();
    expect((await startWorkout('lower', '2026-11-16')).entries[0].rows[0].weight).toBe('102.5');
  });

  it('"save as my new default" makes the template match the workout in progress', async () => {
    let d = await startWorkout('lower', '2026-11-21');
    d = removeEntryByIndex(d, 0);
    d = await addCustomExercise(d, { name: 'Wall sit', startWeight: '', keep: false, kind: 'timedHold' });
    await saveDraftAsDefault(d);
    const t = (await db.templates.get('lower'))!;
    expect(t.items.map((i) => i.exerciseId)).toEqual(d.entries.map((e) => e.exerciseId));
    expect(t.items.map((i) => i.exerciseId)).not.toContain('hack-squat');
    expect(await db.exercises.get('hack-squat')).toBeDefined();
  });
});

const removeEntryByIndex = (d: Draft, i: number) => removeEntry(d, d.entries[i].key);
