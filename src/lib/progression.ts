// The progression rule. Everything here is a pure function of saved history,
// so suggestions are never stored: edit or delete a past workout and the next
// suggestion simply changes with it.

import type { Exercise, ExerciseKind, SetRecord, Workout } from '../types';
import { formatShortDate } from './dates';
import { DEFAULT_REP_GOAL, isLogged } from './model';

/** She must hit at least the rep goal (default 12) on her best set... */
export const REPS_TO_PROGRESS = DEFAULT_REP_GOAL;
/** ...and average at least half a rep under it (default 11.5) across her heaviest sets. */
export const AVG_REPS_TO_PROGRESS = DEFAULT_REP_GOAL - 0.5;

/** 120 -> "120", 122.5 -> "122.5" (no trailing zeros, no float noise). */
export function formatWeight(w: number): string {
  return String(Math.round(w * 100) / 100);
}

/** Sets that count: rows with no reps (or no seconds, for a hold) are ignored. */
export function validSets(sets: SetRecord[]): SetRecord[] {
  return sets.filter(isLogged);
}

/** Only the sets at the heaviest weight used (this ignores light warm-up sets). */
export function topWeightSets(sets: SetRecord[]): SetRecord[] {
  const valid = validSets(sets);
  if (valid.length === 0) return [];
  const max = Math.max(...valid.map((s) => s.weight));
  return valid.filter((s) => s.weight === max);
}

export interface Suggestion {
  weight: number;
  increased: boolean;
  text: string; // the sentence shown on the card
}

/**
 * Given the sets from one saved session, what weight should come next?
 * Returns null if the session has no usable sets. Never suggests a decrease.
 */
export function suggestNext(sets: SetRecord[], increment: number, repGoal = DEFAULT_REP_GOAL): Suggestion | null {
  const top = topWeightSets(sets);
  if (top.length === 0) return null;

  const weight = top[0].weight;
  const highestReps = Math.max(...top.map((s) => s.reps));
  const avgReps = top.reduce((sum, s) => sum + s.reps, 0) / top.length;

  if (highestReps >= repGoal && avgReps >= repGoal - 0.5) {
    const next = Math.round((weight + increment) * 100) / 100;
    return {
      weight: next,
      increased: true,
      text: `Suggested: ${formatWeight(next)} lb (up ${formatWeight(increment)}, you hit ${repGoal}+ reps)`,
    };
  }
  return { weight, increased: false, text: `Suggested: ${formatWeight(weight)} lb (same)` };
}

export interface LastSession {
  date: string;
  sets: SetRecord[];
}

/**
 * Find the most recent saved session for an exercise (deleted workouts are skipped).
 * `beforeDate` / `excludeId` let the History page ask "what came before this workout?".
 */
export function findLastSession(
  workouts: Workout[],
  exerciseId: string,
  opts: { beforeDate?: string; excludeId?: string } = {},
): LastSession | null {
  let best: { w: Workout; sets: SetRecord[] } | null = null;
  for (const w of workouts) {
    if (w.deletedAt) continue;
    if (opts.excludeId && w.id === opts.excludeId) continue;
    if (opts.beforeDate && w.date >= opts.beforeDate) continue;
    const sets = validSets(w.entries.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets));
    if (sets.length === 0) continue;
    // Newest date wins; same date -> most recently created.
    if (!best || w.date > best.w.date || (w.date === best.w.date && w.createdAt > best.w.createdAt)) {
      best = { w, sets };
    }
  }
  return best ? { date: best.w.date, sets: best.sets } : null;
}

/** "120 lb x 12, 12, 11" (groups consecutive sets with the same weight). Holds read "30, 30, 25 seconds". */
export function describeSets(sets: SetRecord[], kind: ExerciseKind = 'weightReps'): string {
  if (kind === 'timedHold') return `${validSets(sets).map((s) => s.seconds ?? 0).join(', ')} seconds`;
  if (kind === 'repsOnly') return `${validSets(sets).map((s) => s.reps).join(', ')} reps`;
  const groups: { weight: number; reps: number[] }[] = [];
  for (const s of validSets(sets)) {
    const last = groups[groups.length - 1];
    if (last && last.weight === s.weight) last.reps.push(s.reps);
    else groups.push({ weight: s.weight, reps: [s.reps] });
  }
  return groups.map((g) => `${formatWeight(g.weight)} lb x ${g.reps.join(', ')}`).join('; ');
}

/** What a workout card shows for one exercise. */
export interface Hint {
  lastText: string; // "Last time (Nov 8): 120 lb x 12, 12, 11"  or "No history yet"
  suggestionText: string | null;
  weight: string; // text to prefill into the weight boxes ("" if unknown)
}

export function hintFor(
  workouts: Workout[],
  exercise: Pick<Exercise, 'id' | 'increment'> & Partial<Pick<Exercise, 'kind' | 'autoIncrease' | 'repGoal'>>,
  startWeight?: string,
): Hint {
  const kind = exercise.kind ?? 'weightReps';
  const last = findLastSession(workouts, exercise.id);

  // Reps-only and timed-hold exercises have no weight to suggest: just show what she did last time.
  if (kind !== 'weightReps') {
    return {
      lastText: last ? `Last time (${formatShortDate(last.date)}): ${describeSets(last.sets, kind)}` : 'No history yet',
      suggestionText: null,
      weight: '',
    };
  }

  // Auto-increase can be switched off per exercise (e.g. PT exercises): keep the same weight.
  const autoIncrease = exercise.autoIncrease !== false;
  const suggestion = last
    ? autoIncrease
      ? suggestNext(last.sets, exercise.increment, exercise.repGoal ?? DEFAULT_REP_GOAL)
      : suggestNext(last.sets, 0, Infinity)
    : null;
  if (last && suggestion) {
    return {
      lastText: `Last time (${formatShortDate(last.date)}): ${describeSets(last.sets)}`,
      suggestionText: autoIncrease ? suggestion.text : `Same weight as last time: ${formatWeight(suggestion.weight)} lb`,
      weight: formatWeight(suggestion.weight),
    };
  }
  // No history: use the starting weight he typed for a custom exercise, otherwise leave blank.
  return {
    lastText: 'No history yet',
    suggestionText: startWeight ? `Starting weight: ${startWeight} lb` : null,
    weight: startWeight ?? '',
  };
}
