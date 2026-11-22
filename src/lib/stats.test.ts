import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutType } from '../types';
import { applyDraftToWorkout, markDeleted, setCell, workoutToDraft } from './draft';
import { exerciseSessions, exerciseStats, exerciseView, loggedExercises, summarize } from './stats';

let n = 0;
const w = (date: string, type: WorkoutType = 'lower', sets = [{ weight: 100, reps: 10 }], extra: Partial<Workout> = {}): Workout => ({
  id: 'w' + n++, date, type, createdAt: n, updatedAt: n,
  entries: [{ exerciseId: 'hack-squat', name: 'Hack squat', sets }], ...extra,
});

const TODAY = '2026-11-21'; // a Saturday; its week starts Mon Nov 16

describe('summary', () => {
  const ws = [
    w('2026-11-16'), w('2026-11-21', 'upper'), // this week: 2
    w('2026-11-09', 'full'),                    // last week: 1
    w('2026-10-01'),                            // older than 4 weeks
  ];
  it('counts weeks Monday-Sunday and fills empty weeks with zero', () => {
    const s = summarize(ws, '4w', TODAY);
    expect(s.weeks.map((x) => x.week)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    expect(s.weeks.map((x) => x.count)).toEqual([0, 0, 1, 2]);
    expect(s.total).toBe(3);
    expect(s.avgPerWeek).toBe(0.75);
    expect(s.weeksWith2Plus).toBe(1);
    expect(s.byType).toEqual({ lower: 1, upper: 1, full: 1, pt: 0 });
  });
  it('Saturday + Sunday count as one week', () => {
    const s = summarize([w('2026-11-21'), w('2026-11-22')], '4w', '2026-11-22');
    expect(s.weeks[s.weeks.length - 1].count).toBe(2);
  });
  it('"all" starts at the first workout', () => {
    const s = summarize(ws, 'all', TODAY);
    expect(s.total).toBe(4);
    expect(s.weeks[0].week).toBe('2026-09-28');
  });
  it('1 week: this week only, with one entry per day Monday to Sunday', () => {
    const s = summarize(ws, '1w', TODAY);
    expect(s.total).toBe(2);
    expect(s.weeks).toHaveLength(1);
    expect(s.days.map((d) => d.count)).toEqual([1, 0, 0, 0, 0, 1, 0]);
    expect(s.days[0].date).toBe('2026-11-16');
    expect(s.days[6].date).toBe('2026-11-22');
  });
  it('ignores deleted workouts and handles no data', () => {
    expect(summarize([w('2026-11-16', 'lower', undefined, { deletedAt: 1 })], '4w', TODAY).total).toBe(0);
    expect(summarize([], 'all', TODAY).weeks).toHaveLength(1);
  });
});

describe('per-exercise stats', () => {
  const ws = [
    w('2026-11-01', 'lower', [{ weight: 60, reps: 15 }, { weight: 110, reps: 12 }, { weight: 110, reps: 10 }]),
    w('2026-11-08', 'lower', [{ weight: 120, reps: 12 }, { weight: 120, reps: 12 }]),
  ];
  it('top weight, average reps per set and volume per session', () => {
    const pts = exerciseSessions(ws, 'hack-squat');
    expect(pts.map((p) => p.weight)).toEqual([110, 120]);
    expect(pts[0].volume).toBe(60 * 15 + 110 * 12 + 110 * 10);
    expect(pts[0].avgReps).toBeCloseTo(37 / 3);
    expect(exerciseStats(pts)).toEqual({ best: 120, avgRepsPerSet: 61 / 5, sessions: 2 });
  });
  it('lists logged exercises', () => {
    expect(loggedExercises(ws)).toEqual([{ id: 'hack-squat', name: 'Hack squat', kind: 'weightReps' }]);
  });
});

describe('editing history', () => {
  it('fixes a typo and the date, keeping id and createdAt', () => {
    const orig = w('2026-11-08', 'lower', [{ weight: 120, reps: 12 }]);
    let d = workoutToDraft(orig);
    d = setCell(d, d.entries[0].key, 0, 'reps', '11');
    d = { ...d, date: '2026-11-09' };
    const edited = applyDraftToWorkout(orig, d, 999)!;
    expect(edited.id).toBe(orig.id);
    expect(edited.createdAt).toBe(orig.createdAt);
    expect(edited.date).toBe('2026-11-09');
    expect(edited.entries[0].sets).toEqual([{ weight: 120, reps: 11 }]);
    expect(edited.updatedAt).toBe(999);
  });
  it('delete leaves a tombstone, and suggestions then ignore it', () => {
    const gone = markDeleted(w('2026-11-08'), 5);
    expect(gone.deletedAt).toBe(5);
    expect(summarize([gone], '4w', TODAY).total).toBe(0);
  });
});

describe('stats for reps-only and timed-hold exercises (stage 1)', () => {
  const w = (date: string, entries: Workout['entries']): Workout => ({ id: date, date, type: 'lower', entries, createdAt: 1, updatedAt: 1 });
  const ws = [
    w('2026-11-01', [
      { exerciseId: 'plank', name: 'Plank', kind: 'timedHold', sets: [{ weight: 0, reps: 0, seconds: 30 }, { weight: 0, reps: 0, seconds: 40 }] },
      { exerciseId: 'bridge', name: 'Bridges', kind: 'repsOnly', sets: [{ weight: 0, reps: 12 }, { weight: 0, reps: 15 }] },
    ]),
  ];
  it('timed holds are measured in seconds', () => {
    expect(exerciseSessions(ws, 'plank')).toMatchObject([{ bestSeconds: 40, totalSeconds: 70, sets: 2 }]);
  });
  it('reps-only exercises are measured in reps', () => {
    expect(exerciseSessions(ws, 'bridge')).toMatchObject([{ bestReps: 15, reps: 27, weight: 0 }]);
  });
  it('both are listed with their kind', () => {
    expect(loggedExercises(ws)).toEqual([
      { id: 'bridge', name: 'Bridges', kind: 'repsOnly' },
      { id: 'plank', name: 'Plank', kind: 'timedHold' },
    ]);
  });
});

describe('what each kind charts (stage 3)', () => {
  const w = (date: string, entries: Workout['entries']): Workout => ({ id: date, date, type: 'lower', entries, createdAt: 1, updatedAt: 1 });
  const hold = (secs: number[]) => ({ exerciseId: 'plank', name: 'Plank', kind: 'timedHold' as const, sets: secs.map((seconds) => ({ weight: 0, reps: 0, seconds })) });
  const reps = (n: number[]) => ({ exerciseId: 'bridge', name: 'Bridges', kind: 'repsOnly' as const, sets: n.map((r) => ({ weight: 0, reps: r })) });
  const lift = (n: number[], weight: number) => ({ exerciseId: 'press', name: 'Press', kind: 'weightReps' as const, sets: n.map((r) => ({ weight, reps: r })) });
  const ws = [
    w('2026-11-01', [hold([30, 40]), reps([10, 12]), lift([12, 10], 50)]),
    w('2026-11-08', [hold([45, 50]), reps([14, 12]), lift([12, 12], 55)]),
  ];

  it('timed holds chart seconds', () => {
    const v = exerciseView('timedHold', exerciseSessions(ws, 'plank'))!;
    expect(v.line.key).toBe('bestSeconds');
    expect(v.bars.key).toBe('totalSeconds');
    expect(v.tiles[0]).toEqual({ value: '50', label: 'Longest hold (seconds)' });
    expect(v.tiles[1].value).toBe('41.3'); // 165 seconds over 4 sets
    expect(exerciseSessions(ws, 'plank').map((p) => p.bestSeconds)).toEqual([40, 50]);
  });
  it('reps-only exercises chart reps, not weight', () => {
    const v = exerciseView('repsOnly', exerciseSessions(ws, 'bridge'))!;
    expect(v.line.key).toBe('bestReps');
    expect(v.bars.key).toBe('reps');
    expect(v.tiles[0].value).toBe('14');
    expect(v.tiles[1].value).toBe('12.0');
  });
  it('weight + reps still charts weight and volume', () => {
    const v = exerciseView('weightReps', exerciseSessions(ws, 'press'))!;
    expect(v.line.key).toBe('weight');
    expect(v.bars.key).toBe('volume');
    expect(v.tiles[0]).toEqual({ value: '55', label: 'Best weight (lb)' });
  });
  it('nothing to chart gives no view', () => {
    expect(exerciseView('timedHold', [])).toBeNull();
  });
});

describe('editing a saved hold or bodyweight workout (stage 3)', () => {
  const saved: Workout = {
    id: 'w1', date: '2026-11-01', type: 'lower', typeName: 'Legs', createdAt: 1, updatedAt: 1,
    entries: [
      { exerciseId: 'plank', name: 'Plank', kind: 'timedHold', sets: [{ weight: 0, reps: 0, seconds: 30 }] },
      { exerciseId: 'bridge', name: 'Bridges', kind: 'repsOnly', sets: [{ weight: 0, reps: 10 }] },
    ],
  };
  it('opens with the right boxes filled, and saving unchanged changes no numbers', () => {
    const d = workoutToDraft(saved);
    expect(d.entries[0].rows[0]).toEqual({ weight: '0', reps: '0', seconds: '30' });
    expect(applyDraftToWorkout(saved, d, 5)!.entries).toEqual(saved.entries);
  });
  it('lets seconds and reps be corrected, keeping the kind and the saved name', () => {
    let d = workoutToDraft(saved);
    d = setCell(d, d.entries[0].key, 0, 'seconds', '45');
    d = setCell(d, d.entries[1].key, 0, 'reps', '15');
    const w = applyDraftToWorkout(saved, d, 9)!;
    expect(w.entries[0]).toMatchObject({ kind: 'timedHold', sets: [{ seconds: 45 }] });
    expect(w.entries[1]).toMatchObject({ kind: 'repsOnly', sets: [{ weight: 0, reps: 15 }] });
    expect(w.typeName).toBe('Legs');
    expect(exerciseSessions([w], 'plank')[0].bestSeconds).toBe(45);
  });
  it('clearing the seconds removes that set; clearing everything returns null', () => {
    let d = workoutToDraft(saved);
    d = setCell(d, d.entries[0].key, 0, 'seconds', '');
    expect(applyDraftToWorkout(saved, d)!.entries).toHaveLength(1);
    d = setCell(d, d.entries[1].key, 0, 'reps', '');
    expect(applyDraftToWorkout(saved, d)).toBeNull();
  });
});

describe('Physical Therapy in the summary', () => {
  it('counts physical therapy workouts separately', () => {
    const w = (id: string, type: Workout['type']): Workout => ({ id, date: '2026-11-17', type, entries: [], createdAt: 1, updatedAt: 1 });
    const s = summarize([w('a', 'pt'), w('b', 'pt'), w('c', 'lower')], 'all', '2026-11-21');
    expect(s.byType).toEqual({ lower: 1, upper: 0, full: 0, pt: 2 });
    expect(s.total).toBe(3);
  });
});
