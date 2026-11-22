import { describe, expect, it } from 'vitest';
import type { SetRecord, Workout } from '../types';
import { describeSets, findLastSession, hintFor, suggestNext, topWeightSets } from './progression';

// Helper: build sets at one weight from a list of reps.
const sets = (weight: number, ...reps: number[]): SetRecord[] => reps.map((r) => ({ weight, reps: r }));

describe('progression rule (the examples from the spec)', () => {
  it('12,12,11 -> increase (avg 11.67)', () => {
    const s = suggestNext(sets(120, 12, 12, 11), 5)!;
    expect(s.weight).toBe(125);
    expect(s.increased).toBe(true);
    expect(s.text).toBe('Suggested: 125 lb (up 5, you hit 12+ reps)');
  });
  it('12,11 -> increase (avg exactly 11.5)', () => {
    expect(suggestNext(sets(120, 12, 11), 5)!.weight).toBe(125);
  });
  it('12,10,10 -> same weight', () => {
    const s = suggestNext(sets(120, 12, 10, 10), 5)!;
    expect(s.weight).toBe(120);
    expect(s.increased).toBe(false);
    expect(s.text).toBe('Suggested: 120 lb (same)');
  });
  it('14,9,9 -> same weight', () => {
    expect(suggestNext(sets(120, 14, 9, 9), 5)!.weight).toBe(120);
  });
});

describe('progression edge cases', () => {
  it('only the heaviest weight counts (warm-up sets are ignored)', () => {
    // Warm-up of 15 reps at 60 lb must not pull the average down or count as the max.
    const s = [...sets(60, 15), ...sets(120, 12, 12)];
    expect(topWeightSets(s)).toHaveLength(2);
    expect(suggestNext(s, 5)!.weight).toBe(125);
  });
  it('a single heavy set under 12 reps stays the same', () => {
    expect(suggestNext([...sets(60, 15), ...sets(120, 8)], 5)!.weight).toBe(120);
  });
  it('rows with no reps are ignored', () => {
    expect(suggestNext([...sets(120, 12, 12), { weight: 130, reps: 0 }], 5)!.weight).toBe(125);
  });
  it('supports decimal weights and increments', () => {
    const s = suggestNext(sets(122.5, 12, 12), 2.5)!;
    expect(s.weight).toBe(125);
    expect(s.text).toBe('Suggested: 125 lb (up 2.5, you hit 12+ reps)');
  });
  it('never decreases and returns null with no usable sets', () => {
    expect(suggestNext([], 5)).toBeNull();
    expect(suggestNext(sets(100, 0, 0), 5)).toBeNull();
    expect(suggestNext(sets(100, 3), 5)!.weight).toBe(100);
  });
});

const workout = (id: string, date: string, exerciseId: string, s: SetRecord[], extra: Partial<Workout> = {}): Workout => ({
  id,
  date,
  type: 'lower',
  entries: [{ exerciseId, name: exerciseId, sets: s }],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('findLastSession / hints', () => {
  const history = [
    workout('a', '2026-11-01', 'hack-squat', sets(110, 12, 12, 12)),
    workout('b', '2026-11-08', 'hack-squat', sets(120, 12, 12, 11)),
  ];
  it('uses the most recent date', () => {
    expect(findLastSession(history, 'hack-squat')!.date).toBe('2026-11-08');
  });
  it('skips deleted workouts, so deleting a workout changes the suggestion', () => {
    const h = [history[0], { ...history[1], deletedAt: 5 }];
    expect(findLastSession(h, 'hack-squat')!.date).toBe('2026-11-01');
  });
  it('can look only at workouts before a date', () => {
    expect(findLastSession(history, 'hack-squat', { beforeDate: '2026-11-08' })!.date).toBe('2026-11-01');
  });
  it('shared exercise: history from any workout type counts', () => {
    const full = workout('c', '2026-11-15', 'hack-squat', sets(125, 10), { type: 'full' });
    expect(findLastSession([...history, full], 'hack-squat')!.sets[0].weight).toBe(125);
  });
  it('builds the card text', () => {
    const h = hintFor(history, { id: 'hack-squat', increment: 5 });
    expect(h.lastText).toBe('Last time (Nov 8): 120 lb x 12, 12, 11');
    expect(h.suggestionText).toBe('Suggested: 125 lb (up 5, you hit 12+ reps)');
    expect(h.weight).toBe('125');
  });
  it('no history: blank weight, or the custom starting weight', () => {
    expect(hintFor([], { id: 'x', increment: 5 }).weight).toBe('');
    expect(hintFor([], { id: 'x', increment: 5 }, '40').weight).toBe('40');
  });
  it('describes sets at mixed weights', () => {
    expect(describeSets([...sets(60, 15), ...sets(120, 12, 11)])).toBe('60 lb x 15; 120 lb x 12, 11');
  });
});

describe('per-exercise rules (stage 1)', () => {
  const sets = (reps: number[], weight = 50): SetRecord[] => reps.map((r) => ({ weight, reps: r }));
  const history = (kind: 'weightReps' | 'repsOnly' | 'timedHold', s: SetRecord[]): Workout[] => [
    { id: 'w', date: '2026-11-08', type: 'lower', createdAt: 1, updatedAt: 1, entries: [{ exerciseId: 'x', name: 'X', kind, sets: s }] },
  ];

  it('uses the exercise rep goal', () => {
    expect(suggestNext(sets([10, 10, 10]), 5, 10)?.weight).toBe(55); // goal 10: hit it
    expect(suggestNext(sets([10, 10, 10]), 5)?.weight).toBe(50); // default goal 12: stay
    expect(suggestNext(sets([15, 15]), 2.5, 15)?.weight).toBe(52.5);
    expect(suggestNext(sets([15, 13]), 5, 15)?.weight).toBe(50); // average 14 < 14.5
  });
  it('auto-increase off keeps the same weight even after a perfect session', () => {
    const h = hintFor(history('weightReps', sets([12, 12, 12])), { id: 'x', increment: 5, autoIncrease: false });
    expect(h.weight).toBe('50');
    expect(h.suggestionText).toMatch(/Same weight/);
  });
  it('auto-increase on with decimals', () => {
    const h = hintFor(history('weightReps', sets([12, 12, 12])), { id: 'x', increment: 2.5, autoIncrease: true, repGoal: 12 });
    expect(h.weight).toBe('52.5');
  });
  it('reps-only and timed-hold exercises show last time and suggest no weight', () => {
    const reps = hintFor(history('repsOnly', sets([15, 14], 0)), { id: 'x', increment: 5, kind: 'repsOnly' });
    expect(reps.lastText).toMatch(/15, 14 reps/);
    expect(reps.weight).toBe('');
    expect(reps.suggestionText).toBeNull();
    const hold = hintFor(history('timedHold', [{ weight: 0, reps: 0, seconds: 30 }, { weight: 0, reps: 0, seconds: 25 }]), { id: 'x', increment: 5, kind: 'timedHold' });
    expect(hold.lastText).toMatch(/30, 25 seconds/);
    expect(hold.weight).toBe('');
  });
  it('a hold counts as a logged set', () => {
    expect(findLastSession(history('timedHold', [{ weight: 0, reps: 0, seconds: 20 }]), 'x')?.sets).toHaveLength(1);
  });
});
