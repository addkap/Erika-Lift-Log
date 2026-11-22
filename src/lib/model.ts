// Small pure helpers about exercises, kinds and workout names. Also fills in the fields that
// older saved data (and backups from before this version) do not have.

import {
  DEFAULT_WORKOUT_NAMES,
  type Exercise,
  type ExerciseKind,
  type SetRecord,
  type Template,
  type Workout,
  type WorkoutType,
} from '../types';

/** The default "any set this high" rep goal for automatic weight increases. */
export const DEFAULT_REP_GOAL = 12;

export const KIND_LABELS: Record<ExerciseKind, string> = {
  weightReps: 'Weight and reps',
  repsOnly: 'Reps only (bodyweight or band)',
  timedHold: 'Timed hold (seconds)',
};

export const entryKind = (e: { kind?: ExerciseKind }): ExerciseKind => e.kind ?? 'weightReps';

/** Was anything logged in this set? Reps for most exercises, seconds for a timed hold. */
export const isLogged = (s: SetRecord): boolean => s.reps > 0 || (s.seconds ?? 0) > 0;

/** The one number a set is measured by: weight x reps counts by reps, holds by seconds. */
export const setMeasure = (kind: ExerciseKind, s: SetRecord): number =>
  kind === 'timedHold' ? s.seconds ?? 0 : s.reps;

export function normalizeExercise(raw: Partial<Exercise> & { id: string; name: string }): Exercise {
  const kind: ExerciseKind = raw.kind === 'repsOnly' || raw.kind === 'timedHold' ? raw.kind : 'weightReps';
  return {
    ...raw,
    kind,
    increment: typeof raw.increment === 'number' && raw.increment >= 0 ? raw.increment : 5,
    autoIncrease: kind === 'weightReps' && raw.autoIncrease !== false,
    repGoal: typeof raw.repGoal === 'number' && raw.repGoal >= 1 ? Math.round(raw.repGoal) : DEFAULT_REP_GOAL,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

export function normalizeTemplate(raw: Partial<Template> & { id: WorkoutType }): Template {
  return {
    ...raw,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : DEFAULT_WORKOUT_NAMES[raw.id] ?? 'Workout',
    items: Array.isArray(raw.items) ? raw.items : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

/** The name a saved workout shows: the name it was saved with, or the default for old workouts. */
export const workoutName = (w: Pick<Workout, 'type' | 'typeName'>): string =>
  w.typeName?.trim() || DEFAULT_WORKOUT_NAMES[w.type];

/** The current name of a workout type (for the Start screen and charts of "workouts by type"). */
export const templateName = (templates: Template[], type: WorkoutType): string =>
  templates.find((t) => t.id === type)?.name.trim() || DEFAULT_WORKOUT_NAMES[type];
