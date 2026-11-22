import { describe, expect, it } from 'vitest';
import { normalizeExercise, normalizeTemplate, templateName, workoutName } from './model';
import { parseSyncData } from '../sync/merge';

describe('older data gets sensible defaults', () => {
  it('an exercise from before kinds existed becomes weight + reps with auto-increase on', () => {
    const e = normalizeExercise({ id: 'a', name: 'Chest press', increment: 5, updatedAt: 3 } as never);
    expect(e).toMatchObject({ kind: 'weightReps', autoIncrease: true, repGoal: 12, notes: '', increment: 5, updatedAt: 3 });
  });
  it('keeps decimal increments and a custom rep goal', () => {
    const e = normalizeExercise({ id: 'a', name: 'x', increment: 2.5, repGoal: 15, updatedAt: 1 });
    expect(e.increment).toBe(2.5);
    expect(e.repGoal).toBe(15);
  });
  it('reps-only and timed-hold exercises never auto-increase', () => {
    expect(normalizeExercise({ id: 'a', name: 'x', kind: 'repsOnly', autoIncrease: true, updatedAt: 1 }).autoIncrease).toBe(false);
    expect(normalizeExercise({ id: 'a', name: 'x', kind: 'timedHold', updatedAt: 1 }).autoIncrease).toBe(false);
  });
  it('a template with no name gets the default name', () => {
    expect(normalizeTemplate({ id: 'upper', items: [], updatedAt: 1 }).name).toBe('Upper Body');
  });
  it('an unknown kind falls back to weight + reps', () => {
    expect(normalizeExercise({ id: 'a', name: 'x', kind: 'weird' as never, updatedAt: 1 }).kind).toBe('weightReps');
  });
});

describe('names', () => {
  it('a saved workout shows the name it was saved with, old ones show the default', () => {
    expect(workoutName({ type: 'lower', typeName: 'Legs' })).toBe('Legs');
    expect(workoutName({ type: 'lower' })).toBe('Lower Body');
  });
  it('the Start screen uses the current template name', () => {
    expect(templateName([{ id: 'full', name: 'Everything', items: [], updatedAt: 1 }], 'full')).toBe('Everything');
    expect(templateName([], 'full')).toBe('Full Body');
  });
});

describe('importing older files', () => {
  it('fills in the new fields when reading a file from before this version', () => {
    const text = JSON.stringify({
      app: 'lift-log', version: 1, savedAt: 1,
      exercises: [{ id: 'a', name: 'A', increment: 5, updatedAt: 1 }],
      templates: [{ id: 'lower', items: [], updatedAt: 1 }],
      workouts: [],
    });
    const d = parseSyncData(text);
    expect(d.exercises[0].kind).toBe('weightReps');
    expect(d.templates[0].name).toBe('Lower Body');
  });
});
