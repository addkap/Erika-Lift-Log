// Shared data types. Everything that will sync later has an `id` and `updatedAt`.

export type WorkoutType = 'lower' | 'upper' | 'full';

/** The starting names for the three workout types. Each template stores its own (editable) name. */
export const DEFAULT_WORKOUT_NAMES: Record<WorkoutType, string> = {
  lower: 'Lower Body',
  upper: 'Upper Body',
  full: 'Full Body',
};

/**
 * How an exercise is logged:
 *  - weightReps: a weight and a number of reps per set (the default)
 *  - repsOnly:   just reps (bodyweight or resistance band)
 *  - timedHold:  seconds per set (planks, wall sits, balance holds)
 */
export type ExerciseKind = 'weightReps' | 'repsOnly' | 'timedHold';

/** One movement. Shared by every workout type, so history is shared too. */
export interface Exercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  increment: number; // pounds added when an increase is earned (decimals allowed). Weight + reps only.
  autoIncrease: boolean; // suggest a heavier weight when the rep goal is met. Weight + reps only.
  repGoal: number; // the "any set this high" part of the auto-increase rule (default 12)
  notes: string; // PT cues, shown on the exercise card during a workout
  archived?: boolean; // hidden from new workouts and the add-exercise list, history untouched
  updatedAt: number;
  deletedAt?: number; // tombstone (used by sync)
}

/** One line in a workout template: which exercise, and the recommended set range. */
export interface TemplateItem {
  exerciseId: string;
  minSets: number;
  maxSets: number;
}

/** The default exercise list for Lower / Upper / Full. The id is the workout type. */
export interface Template {
  id: WorkoutType;
  name: string; // what this workout is called (she can rename it)
  items: TemplateItem[];
  updatedAt: number;
}

export interface SetRecord {
  weight: number; // 0 for reps-only and timed-hold sets
  reps: number; // 0 for timed-hold sets
  seconds?: number; // timed-hold sets only
}

export interface WorkoutEntry {
  exerciseId: string;
  name: string; // name at the time of saving, so old workouts still read well
  kind?: ExerciseKind; // kind at the time of saving; missing means weightReps (older workouts)
  sets: SetRecord[];
}

/** A saved workout. */
export interface Workout {
  id: string;
  date: string; // YYYY-MM-DD in local time
  type: WorkoutType;
  typeName?: string; // what the workout was called when saved; missing means the default name
  entries: WorkoutEntry[];
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// ---- In-progress workout ("draft"). Lives only on this device. ----

/** Inputs are kept as text while typing so "12." or an empty box works fine. */
export interface DraftRow {
  weight: string;
  reps: string;
  seconds: string;
}

export interface DraftEntry {
  key: string; // unique within the draft (so the same exercise could appear twice)
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  notes: string; // PT cues copied from the exercise when the workout starts
  minSets: number;
  maxSets: number;
  startWeight?: string; // for a custom exercise with no history yet
  rows: DraftRow[];
}

export interface Draft {
  id: 'current'; // there is only ever one draft
  type: WorkoutType;
  typeName?: string; // the workout's name when it was started
  date: string;
  entries: DraftEntry[];
  updatedAt: number;
}

// ---- OneDrive sync settings (this device only, never uploaded) ----

/** The OneDrive folder that holds lift-log-data.json. */
export interface FolderRef {
  driveId: string;
  itemId: string;
  name: string;
}

export interface SyncMeta {
  id: 'sync';
  folder?: FolderRef;
  syncedSig?: string; // fingerprint of the data as of the last successful sync (see merge.ts: signature)
  lastSync?: number; // time of the last successful sync
}
