import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { addCustomExercise, discardDraft, finishWorkout, loadDraft, saveDraft, saveDraftAsDefault, startWorkout } from '../store';
import { addEntry, addRow, entryHasData, moveEntry, removeEntry, removeLastRow, sanitizeNumber, setCell } from '../lib/draft';
import { formatLongDate, todayLocal } from '../lib/dates';
import { hintFor } from '../lib/progression';
import { KIND_LABELS, templateName } from '../lib/model';
import { draftMatchesTemplate } from '../lib/templates';
import { DEFAULT_WORKOUT_NAMES, WORKOUT_TYPES, type Draft, type Exercise, type ExerciseKind, type Template, type Workout, type WorkoutType } from '../types';
import ExerciseCard from '../components/ExerciseCard';
import StreakCard from '../components/StreakCard';
import { isConfigured } from '../sync/auth';
import { useSyncStatus } from '../sync/useSyncStatus';

export default function WorkoutPage({ onGoSettings, onEditWorkouts }: { onGoSettings: () => void; onEditWorkouts: () => void }) {
  // undefined = still loading, null = no workout in progress
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  const draftRef = useRef<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  const workouts = useLiveQuery(() => db.workouts.toArray(), [], []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);

  // On open, pick up any workout that was in progress (autosave).
  useEffect(() => {
    loadDraft().then((d) => {
      draftRef.current = d ?? null;
      setDraft(d ?? null);
    });
  }, []);

  /** Change the draft and autosave it immediately. */
  function update(fn: (d: Draft) => Draft) {
    const cur = draftRef.current;
    if (!cur) return;
    const next = { ...fn(cur), updatedAt: Date.now() };
    draftRef.current = next;
    setDraft(next);
    void saveDraft(next);
  }

  function replace(next: Draft | null) {
    draftRef.current = next;
    setDraft(next);
  }

  if (draft === undefined) return <p>Loading…</p>;

  if (draft === null) {
    return <StartScreen saved={saved} onGoSettings={onGoSettings} onEditWorkouts={onEditWorkouts} onStart={async (type, date) => { setSaved(false); replace(await startWorkout(type, date)); }} />;
  }

  return (
    <ActiveWorkout
      draft={draft}
      exerciseOf={(id) => exercises.find((e) => e.id === id)}
      exercises={exercises}
      template={templates.find((t) => t.id === draft.type)}
      workouts={workouts}
      update={update}
      onFinished={() => { replace(null); setSaved(true); }}
      onCancel={async () => { await discardDraft(); replace(null); }}
      onCustom={async (opts) => {
        // addCustomExercise saves the exercise itself; the new card is then added through update(),
        // which autosaves the draft and keeps anything typed in the meantime.
        const withNew = await addCustomExercise(draftRef.current!, opts);
        const added = withNew.entries[withNew.entries.length - 1];
        update((d) => addEntry(d, added));
      }}
    />
  );
}

/** The exercise's current settings, falling back to what the card was started with if it is gone. */
function exerciseSettings(ex: Exercise | undefined, entry: { kind: Exercise['kind'] }) {
  return { increment: ex?.increment ?? 5, kind: ex?.kind ?? entry.kind, autoIncrease: ex?.autoIncrease, repGoal: ex?.repGoal };
}

// ---------------------------------------------------------------- start screen

function StartScreen({ saved, onStart, onGoSettings, onEditWorkouts }: { saved: boolean; onStart: (t: WorkoutType, date: string) => void; onGoSettings: () => void; onEditWorkouts: () => void }) {
  const sync = useSyncStatus();
  const [type, setType] = useState<WorkoutType | null>(null);
  const [date, setDate] = useState(todayLocal());
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);
  const noneBuilt = templates.length > 0 && templates.every((t) => t.items.length === 0);
  const picked = templates.find((t) => t.id === type);

  return (
    <>
      <h1>Start a workout</h1>
      <StreakCard />
      {noneBuilt && (
        <section className="card">
          <h2>Welcome! Let’s set up your workouts</h2>
          <p>First, tell the app which exercises you do in each workout. It only takes a few minutes, and you can change them any time.</p>
          <button className="btn primary" onClick={onEditWorkouts}>Build my workouts</button>
        </section>
      )}
      {isConfigured() && !sync.configured && (
        <section className="card">
          <h2>Back up to OneDrive</h2>
          <p>Your workouts are safe on this phone. Set up OneDrive to keep a copy too.</p>
          <button className="btn" onClick={onGoSettings}>Set up OneDrive</button>
        </section>
      )}
      {saved && <p className="banner ok" role="status">Workout saved. Great job!</p>}

      <p className="label">Which workout?</p>
      <div className="choices">
        {WORKOUT_TYPES.map((t) => (
          <button key={t} className={type === t ? 'choice selected' : 'choice'} aria-pressed={type === t} onClick={() => setType(t)}>
            {templateName(templates, t)}
          </button>
        ))}
      </div>

      <label className="label" htmlFor="date">Date</label>
      <input id="date" className="date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />

      <button className="btn primary big" disabled={!type} onClick={() => type && onStart(type, date)}>
        Start
      </button>
      {!type && <p className="muted">Tap one of the workouts above first.</p>}
      {picked && picked.items.length === 0 && !noneBuilt && (
        <p className="muted">This workout has no exercises yet. You can add some while you work out, or build the list under Settings, Edit my workouts.</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------- workout in progress

function ActiveWorkout(props: {
  draft: Draft;
  workouts: Workout[];
  exerciseOf: (exerciseId: string) => Exercise | undefined;
  exercises: Exercise[];
  template: Template | undefined;
  update: (fn: (d: Draft) => Draft) => void;
  onFinished: () => void;
  onCancel: () => void;
  onCustom: (opts: { name: string; startWeight: string; keep: boolean; kind: ExerciseKind }) => void;
}) {
  const { draft, workouts, exerciseOf, exercises, template, update, onFinished, onCancel, onCustom } = props;
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [defaultSaved, setDefaultSaved] = useState(false);
  const workoutLabel = draft.typeName || DEFAULT_WORKOUT_NAMES[draft.type];
  const differs = !!template && !draftMatchesTemplate(template, draft.entries, exercises);

  async function finish() {
    const w = await finishWorkout(draft);
    if (!w) { setError('Enter the reps for at least one set, then tap Finish.'); return; }
    onFinished();
  }

  return (
    <>
      <h1>{draft.typeName || DEFAULT_WORKOUT_NAMES[draft.type]}</h1>
      <label className="label" htmlFor="wdate">Date: {formatLongDate(draft.date)}</label>
      <input id="wdate" className="date" type="date" value={draft.date} onChange={(e) => e.target.value && update((d) => ({ ...d, date: e.target.value }))} />

      {draft.entries.map((entry, i) => (
        <ExerciseCard
          key={entry.key}
          entry={entry}
          hint={hintFor(workouts, { id: entry.exerciseId, ...exerciseSettings(exerciseOf(entry.exerciseId), entry) }, entry.startWeight)}
          isFirst={i === 0}
          isLast={i === draft.entries.length - 1}
          onCell={(row, field, value) => update((d) => setCell(d, entry.key, row, field, value))}
          onAddSet={() => update((d) => addRow(d, entry.key))}
          onRemoveSet={() => update((d) => removeLastRow(d, entry.key))}
          onMove={(dir) => update((d) => moveEntry(d, entry.key, dir))}
          onRemove={() => {
            if (!entryHasData(entry) || window.confirm(`Skip ${entry.name}? The sets you typed will be removed.`)) {
              update((d) => removeEntry(d, entry.key));
            }
          }}
        />
      ))}

      {adding ? (
        <CustomForm onAdd={(o) => { onCustom(o); setAdding(false); }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn" onClick={() => setAdding(true)}>Add another exercise</button>
      )}

      {differs && (
        <section className="card">
          <h2>Keep this list?</h2>
          <p>The exercises today are different from your {workoutLabel} workout. Save today’s list, in this order, as your new {workoutLabel} for next time. Past workouts stay exactly as they are.</p>
          <button className="btn" onClick={async () => { await saveDraftAsDefault(draft); setDefaultSaved(true); }}>Save as my new {workoutLabel}</button>
        </section>
      )}
      {defaultSaved && !differs && <p className="banner ok" role="status">Saved. Your next {workoutLabel} workout will start with these exercises.</p>}

      {error && <p className="banner err" role="alert">{error}</p>}
      <button className="btn primary big" onClick={finish}>Finish workout</button>
      <button className="btn danger" onClick={() => window.confirm('Throw away this workout? Nothing will be saved.') && onCancel()}>
        Cancel workout
      </button>
    </>
  );
}

function CustomForm({ onAdd, onCancel }: { onAdd: (o: { name: string; startWeight: string; keep: boolean; kind: ExerciseKind }) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [keep, setKeep] = useState(false);
  const [kind, setKind] = useState<ExerciseKind>('weightReps');
  const names = useLiveQuery(() => db.exercises.toArray(), [], []).filter((e) => !e.deletedAt && !e.archived).map((e) => e.name);

  return (
    <section className="card">
      <h2>Add an exercise</h2>
      <label className="label" htmlFor="cname">Exercise name</label>
      <input id="cname" className="text" list="known" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <datalist id="known">{names.map((n) => <option key={n} value={n} />)}</datalist>

      <label className="label" htmlFor="ckind">How do you count it?</label>
      <select id="ckind" className="select" value={kind} onChange={(e) => setKind(e.target.value as ExerciseKind)}>
        {(['weightReps', 'repsOnly', 'timedHold'] as ExerciseKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
      </select>

      {kind === 'weightReps' && (
        <>
          <label className="label" htmlFor="cweight">Starting weight (lb)</label>
          <input id="cweight" className="num wide" type="text" inputMode="decimal" value={weight} onFocus={(e) => e.target.select()} onChange={(e) => setWeight(sanitizeNumber(e.target.value, true))} />
        </>
      )}

      <label className="check">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
        <span>Keep in this workout going forward</span>
      </label>

      <div className="btns">
        <button className="btn primary" disabled={!name.trim()} onClick={() => onAdd({ name, startWeight: kind === 'weightReps' ? weight : '', keep, kind })}>Add</button>
        <button className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
