// Numbers for the Summary page. All pure functions of the saved workouts.
import type { ExerciseKind, Workout, WorkoutType } from '../types';
import { addDays, weekStart } from './dates';
import { entryKind, isLogged } from './model';
import { formatWeight } from './progression';

export type Range = '1w' | '4w' | '3m' | '1y' | 'all';
export const RANGES: { id: Range; label: string }[] = [
  { id: '1w', label: '1 week' },
  { id: '4w', label: '4 weeks' },
  { id: '3m', label: '3 months' },
  { id: '1y', label: '1 year' },
  { id: 'all', label: 'All' },
];

/** Workouts that have not been deleted. */
export const liveWorkouts = (ws: Workout[]) => ws.filter((w) => !w.deletedAt);

/** First day (a Monday) of the chosen range. Ranges are counted in whole weeks. */
export function rangeStart(range: Range, today: string, workouts: Workout[]): string {
  const thisWeek = weekStart(today);
  switch (range) {
    case '1w': return thisWeek; // this week only, Monday to Sunday
    case '4w': return addDays(thisWeek, -3 * 7);
    case '3m': return addDays(thisWeek, -12 * 7);
    case '1y': return addDays(thisWeek, -51 * 7);
    case 'all': {
      const dates = liveWorkouts(workouts).map((w) => w.date).sort();
      return dates.length ? weekStart(dates[0]) : thisWeek;
    }
  }
}

export interface WeekCount { week: string; count: number } // week = its Monday

export interface Summary {
  total: number;
  weeks: WeekCount[];
  days: { date: string; count: number }[]; // Mon-Sun, only filled for the 1 week range
  avgPerWeek: number;
  weeksWith2Plus: number;
  byType: Record<WorkoutType, number>;
}

export function summarize(all: Workout[], range: Range, today: string): Summary {
  const live = liveWorkouts(all);
  const start = rangeStart(range, today, live);
  const inRange = live.filter((w) => w.date >= start);

  // Every week from the start through the current week (or a later workout), zeros included.
  const lastDate = inRange.reduce((m, w) => (w.date > m ? w.date : m), today);
  const endWeek = weekStart(lastDate);
  const counts = new Map<string, number>();
  for (const w of inRange) counts.set(weekStart(w.date), (counts.get(weekStart(w.date)) ?? 0) + 1);
  const weeks: WeekCount[] = [];
  for (let wk = start; wk <= endWeek; wk = addDays(wk, 7)) weeks.push({ week: wk, count: counts.get(wk) ?? 0 });

  const byType: Record<WorkoutType, number> = { lower: 0, upper: 0, full: 0 };
  for (const w of inRange) byType[w.type]++;

  // The 1 week view shows one bar per day instead of one bar total.
  const days = range === '1w'
    ? Array.from({ length: 7 }, (_, i) => {
        const date = addDays(start, i);
        return { date, count: inRange.filter((w) => w.date === date).length };
      })
    : [];

  return {
    total: inRange.length,
    weeks,
    days,
    avgPerWeek: inRange.length / weeks.length,
    weeksWith2Plus: weeks.filter((w) => w.count >= 2).length,
    byType,
  };
}

// ---------------------------------------------------------------- per exercise

export interface SessionPoint {
  date: string;
  weight: number; // heaviest weight used that session (0 for reps-only and holds)
  avgReps: number; // average reps per set that session
  bestReps: number; // most reps in any one set
  bestSeconds: number; // longest hold in any one set (timed holds)
  totalSeconds: number; // all hold time that session
  sets: number;
  reps: number; // total reps
  volume: number; // sum of weight x reps over every set
}

/** One point per workout that included this exercise, oldest first. */
export function exerciseSessions(all: Workout[], exerciseId: string): SessionPoint[] {
  const points: SessionPoint[] = [];
  for (const w of liveWorkouts(all)) {
    const sets = w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter(isLogged);
    if (sets.length === 0) continue;
    const reps = sets.reduce((a, s) => a + s.reps, 0);
    const seconds = sets.map((s) => s.seconds ?? 0);
    points.push({
      date: w.date,
      weight: Math.max(...sets.map((s) => s.weight)),
      avgReps: reps / sets.length,
      bestReps: Math.max(...sets.map((s) => s.reps)),
      bestSeconds: Math.max(...seconds),
      totalSeconds: seconds.reduce((a, n) => a + n, 0),
      sets: sets.length,
      reps,
      volume: sets.reduce((a, s) => a + s.weight * s.reps, 0),
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface ExerciseStats { best: number; avgRepsPerSet: number; sessions: number }

export function exerciseStats(points: SessionPoint[]): ExerciseStats | null {
  if (points.length === 0) return null;
  const sets = points.reduce((a, p) => a + p.sets, 0);
  const reps = points.reduce((a, p) => a + p.reps, 0);
  return { best: Math.max(...points.map((p) => p.weight)), avgRepsPerSet: reps / sets, sessions: points.length };
}

/** Exercises that have at least one logged set, with their latest saved name and kind. */
export function loggedExercises(all: Workout[]): { id: string; name: string; kind: ExerciseKind }[] {
  const found = new Map<string, { name: string; kind: ExerciseKind }>();
  for (const w of [...liveWorkouts(all)].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of w.entries) if (e.sets.some(isLogged)) found.set(e.exerciseId, { name: e.name, kind: entryKind(e) });
  }
  return [...found].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- what to chart for each kind

export type PointKey = 'weight' | 'volume' | 'bestReps' | 'reps' | 'bestSeconds' | 'totalSeconds';

export interface ExerciseView {
  tiles: { value: string; label: string }[];
  line: { title: string; key: PointKey; name: string; pad: number }; // pad = space above/below on the chart
  bars: { title: string; note?: string; key: PointKey; name: string };
}

/** Each kind is measured in its own way: weight, reps, or seconds. Returns null if there is nothing to show. */
export function exerciseView(kind: ExerciseKind, points: SessionPoint[]): ExerciseView | null {
  if (points.length === 0) return null;
  const sets = points.reduce((a, p) => a + p.sets, 0);
  const reps = points.reduce((a, p) => a + p.reps, 0);
  const seconds = points.reduce((a, p) => a + p.totalSeconds, 0);
  if (kind === 'timedHold') {
    return {
      tiles: [
        { value: String(Math.max(...points.map((p) => p.bestSeconds))), label: 'Longest hold (seconds)' },
        { value: (seconds / sets).toFixed(1), label: 'Average hold per set (seconds)' },
      ],
      line: { title: 'Longest hold over time', key: 'bestSeconds', name: 'Longest hold (seconds)', pad: 5 },
      bars: { title: 'Total hold time per workout', note: 'All sets added together, in seconds.', key: 'totalSeconds', name: 'Seconds held' },
    };
  }
  if (kind === 'repsOnly') {
    return {
      tiles: [
        { value: String(Math.max(...points.map((p) => p.bestReps))), label: 'Most reps in one set' },
        { value: (reps / sets).toFixed(1), label: 'Average reps per set' },
      ],
      line: { title: 'Best set over time', key: 'bestReps', name: 'Most reps in one set', pad: 2 },
      bars: { title: 'Total reps per workout', note: 'All sets added together.', key: 'reps', name: 'Reps' },
    };
  }
  return {
    tiles: [
      { value: formatWeight(Math.max(...points.map((p) => p.weight))), label: 'Best weight (lb)' },
      { value: (reps / sets).toFixed(1), label: 'Average reps per set' },
    ],
    line: { title: 'Weight over time', key: 'weight', name: 'Weight (lb)', pad: 5 },
    bars: { title: 'Total volume per workout', note: 'Sets × reps × weight, in pounds.', key: 'volume', name: 'Volume (lb)' },
  };
}
