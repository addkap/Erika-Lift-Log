import { DEFAULT_WORKOUT_NAMES, WORKOUT_TYPES, type Exercise, type Template, type WorkoutType } from '../types';

// The starter workouts. They begin EMPTY: she builds her own in Settings ("Edit my workouts").
// updatedAt is 0 so that when sync arrives, any real edit always wins over these placeholders,
// and two devices that each seed these defaults agree with each other.

export const DEFAULT_EXERCISES: Exercise[] = [];

const empty = (id: WorkoutType): Template => ({ id, name: DEFAULT_WORKOUT_NAMES[id], items: [], updatedAt: 0 });

export const DEFAULT_TEMPLATES: Template[] = WORKOUT_TYPES.map(empty);
