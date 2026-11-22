import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import NumberField from '../components/NumberField';
import { formatWeight } from '../lib/progression';
import { DEFAULT_REP_GOAL, KIND_LABELS, templateName } from '../lib/model';
import { parseNumber } from '../lib/draft';
import {
  DEFAULT_MAX_SETS, DEFAULT_MIN_SETS, addItem, isUsable, moveItem, nameTaken, removeItem, renameTemplate, setRange, visibleItems,
} from '../lib/templates';
import { createExercise, saveExercise, setArchived, updateTemplate } from '../store';
import type { Exercise, ExerciseKind, Template, WorkoutType } from '../types';

const TYPES: WorkoutType[] = ['lower', 'upper', 'full'];
const KINDS: ExerciseKind[] = ['weightReps', 'repsOnly', 'timedHold'];

type View =
  | { s: 'list' }
  | { s: 'template'; type: WorkoutType }
  | { s: 'exercise'; type: WorkoutType; id: string | null } // id null = a new exercise
  | { s: 'archived' };

/**
 * "Edit my workouts": build and change the Lower / Upper / Full lists.
 * Everything here applies to FUTURE workouts only. Nothing here deletes history.
 */
export default function EditWorkoutsPage({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>({ s: 'list' });
  const exercises = useLiveQuery(() => db.exercises.toArray(), [], []);
  const templates = useLiveQuery(() => db.templates.toArray(), [], []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  if (view.s === 'template') {
    const t = templates.find((x) => x.id === view.type);
    if (!t) return <p>Loading…</p>;
    return <TemplateScreen template={t} exercises={exercises} onBack={() => setView({ s: 'list' })} onEdit={(id) => setView({ s: 'exercise', type: t.id, id })} />;
  }
  if (view.s === 'exercise') {
    const t = templates.find((x) => x.id === view.type);
    if (!t) return <p>Loading…</p>;
    return <ExerciseScreen template={t} exercises={exercises} exerciseId={view.id} onDone={() => setView({ s: 'template', type: t.id })} />;
  }
  if (view.s === 'archived') {
    return <ArchivedScreen exercises={exercises} onBack={() => setView({ s: 'list' })} />;
  }

  const counts = TYPES.map((type) => {
    const t = templates.find((x) => x.id === type);
    return { type, count: t ? visibleItems(t, exercises).length : 0 };
  });
  const allEmpty = templates.length > 0 && counts.every((c) => c.count === 0);
  const archivedCount = exercises.filter((e) => !e.deletedAt && e.archived).length;

  return (
    <>
      <h1>Edit my workouts</h1>
      <p>Pick a workout to change its exercises. Changes only apply to workouts you start from now on. Your past workouts never change.</p>
      {allEmpty && (
        <section className="card">
          <h2>Let’s build your workouts</h2>
          <p>Tap a workout below and add the exercises you do, in the order you do them. You can change them any time, for example when your physical therapy changes.</p>
        </section>
      )}
      {counts.map(({ type, count }) => (
        <button key={type} className="list-item" onClick={() => setView({ s: 'template', type })}>
          <strong>{templateName(templates, type)}</strong>
          <span>{count === 0 ? 'Nothing here yet. Tap to add exercises.' : `${count} ${count === 1 ? 'exercise' : 'exercises'}`}</span>
        </button>
      ))}
      <button className="btn" onClick={() => setView({ s: 'archived' })}>Archived exercises ({archivedCount})</button>
      <button className="btn" onClick={onBack}>Back to Settings</button>
    </>
  );
}

// ---------------------------------------------------------------- one workout's list

const kindShort: Record<ExerciseKind, string> = { weightReps: 'weight and reps', repsOnly: 'reps only', timedHold: 'timed hold' };

function TemplateScreen(props: { template: Template; exercises: Exercise[]; onBack: () => void; onEdit: (exerciseId: string) => void }) {
  const { template, exercises, onBack, onEdit } = props;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(template.name);
  useEffect(() => {
    setName(template.name);
  }, [template.name]);

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const items = visibleItems(template, exercises);
  const isVisible = (id: string) => isUsable(byId.get(id));
  const inList = new Set(template.items.map((i) => i.exerciseId));
  const available = exercises
    .filter((e) => isUsable(e) && !inList.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const change = (fn: (t: Template) => Template) => updateTemplate(template.id, fn);

  function remove(ex: Exercise) {
    if (window.confirm(`Remove ${ex.name} from ${template.name}? Your past workouts keep it, and you can add it back any time.`)) {
      void change((t) => removeItem(t, ex.id));
    }
  }

  return (
    <>
      <h1>{template.name}</h1>
      <p>These are the exercises this workout starts with, in order. Changes apply to future workouts only.</p>

      <label className="label" htmlFor="tname">Name of this workout</label>
      <input
        id="tname"
        className="text"
        value={name}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => (name.trim() ? void change((t) => renameTemplate(t, name)) : setName(template.name))}
      />

      {items.length === 0 && <p className="card">No exercises yet. Tap <strong>Add an exercise</strong> below to start.</p>}

      {items.map((item, i) => {
        const ex = byId.get(item.exerciseId)!;
        const range = item.minSets === item.maxSets ? `${item.minSets}` : `${item.minSets}-${item.maxSets}`;
        return (
          <section className="card" key={item.exerciseId}>
            <h2>{i + 1}. {ex.name}</h2>
            <p className="muted">
              {kindShort[ex.kind]} · {range} sets
              {ex.kind === 'weightReps' && (ex.autoIncrease ? ` · adds ${formatWeight(ex.increment)} lb at ${ex.repGoal}+ reps` : ' · weight stays as you set it')}
            </p>
            {ex.notes && <p className="notes">{ex.notes}</p>}
            <div className="btns">
              <button className="btn small" disabled={i === 0} onClick={() => change((t) => moveItem(t, ex.id, -1, isVisible))}>Move up</button>
              <button className="btn small" disabled={i === items.length - 1} onClick={() => change((t) => moveItem(t, ex.id, 1, isVisible))}>Move down</button>
            </div>
            <div className="btns">
              <button className="btn small" onClick={() => onEdit(ex.id)}>Edit</button>
              <button className="btn small danger" onClick={() => remove(ex)}>Remove</button>
            </div>
          </section>
        );
      })}

      {adding ? (
        <section className="card">
          <h2>Add an exercise</h2>
          {available.length > 0 && (
            <>
              <p className="label">Pick one you already have:</p>
              {available.map((e) => (
                <button key={e.id} className="btn" onClick={() => { void change((t) => setRange(addItem(t, e.id), e.id, DEFAULT_MIN_SETS, DEFAULT_MAX_SETS)); setAdding(false); }}>
                  {e.name} <span className="hint">({kindShort[e.kind]})</span>
                </button>
              ))}
              <p className="label">Or:</p>
            </>
          )}
          <button className="btn primary" onClick={() => onEdit('')}>Create a new exercise</button>
          <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
        </section>
      ) : (
        <button className="btn primary" onClick={() => setAdding(true)}>Add an exercise</button>
      )}

      <button className="btn" onClick={onBack}>Done</button>
    </>
  );
}

// ---------------------------------------------------------------- create or edit one exercise

function ExerciseScreen(props: { template: Template; exercises: Exercise[]; exerciseId: string | null; onDone: () => void }) {
  const { template, exercises, onDone } = props;
  const exerciseId = props.exerciseId || null; // '' means "new"
  const existing = exerciseId ? exercises.find((e) => e.id === exerciseId) : undefined;
  const item = existing ? template.items.find((i) => i.exerciseId === existing.id) : undefined;
  const workouts = useLiveQuery(() => db.workouts.toArray(), [], []);
  const hasHistory = !!existing && workouts.some((w) => !w.deletedAt && w.entries.some((e) => e.exerciseId === existing.id));

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<ExerciseKind>(existing?.kind ?? 'weightReps');
  const [minSets, setMinSets] = useState(String(item?.minSets ?? DEFAULT_MIN_SETS));
  const [maxSets, setMaxSets] = useState(String(item?.maxSets ?? DEFAULT_MAX_SETS));
  const [increment, setIncrement] = useState(String(existing?.increment ?? 5));
  const [auto, setAuto] = useState(existing?.autoIncrease ?? true);
  const [goal, setGoal] = useState(String(existing?.repGoal ?? DEFAULT_REP_GOAL));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');

  async function save() {
    const clean = name.trim();
    if (!clean) return setError('Type a name for the exercise.');
    if (nameTaken(exercises, clean, existing?.id)) return setError(`You already have an exercise called “${clean}”. Pick it from the list instead, or use a different name.`);
    const lo = Math.max(1, Math.round(parseNumber(minSets)) || DEFAULT_MIN_SETS);
    const hi = Math.max(lo, Math.round(parseNumber(maxSets)) || lo);
    const fields = {
      name: clean,
      kind,
      increment: parseNumber(increment) > 0 ? parseNumber(increment) : 5,
      autoIncrease: kind === 'weightReps' && auto,
      repGoal: Math.max(1, Math.round(parseNumber(goal)) || DEFAULT_REP_GOAL),
      notes: notes.trim(),
    };
    if (existing) {
      await saveExercise(existing.id, fields);
      await updateTemplate(template.id, (t) => setRange(t, existing.id, lo, hi));
    } else {
      await createExercise(template.id, fields, { min: lo, max: hi });
    }
    onDone();
  }

  async function archive() {
    if (!existing) return;
    if (window.confirm(`Archive ${existing.name}? It disappears from all your workouts and from the add list, but your past workouts and charts keep it. You can restore it under “Archived exercises”.`)) {
      await setArchived(existing.id, true);
      onDone();
    }
  }

  return (
    <>
      <h1>{existing ? 'Edit exercise' : 'New exercise'}</h1>
      <p className="muted">For the {template.name} workout. Changes apply to future workouts only.</p>

      <label className="label" htmlFor="ename">Exercise name</label>
      <input id="ename" className="text" value={name} autoComplete="off" onChange={(e) => { setName(e.target.value); setError(''); }} />

      <p className="label">How do you count it?</p>
      <div className="pillrow" role="group" aria-label="How do you count it?">
        {KINDS.map((k) => (
          <button key={k} className={kind === k ? 'kindbtn selected' : 'kindbtn'} aria-pressed={kind === k} disabled={hasHistory && k !== kind} onClick={() => setKind(k)}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      {hasHistory && <p className="hint">This exercise already has saved workouts, so how it is counted can’t change. To count it differently, create a new exercise.</p>}

      <p className="label">Recommended sets (from – to)</p>
      <div className="btns">
        <NumberField label="Minimum sets" value={minSets} onChange={setMinSets} />
        <NumberField label="Maximum sets" value={maxSets} onChange={setMaxSets} />
      </div>

      {kind === 'weightReps' && (
        <>
          <label className="check">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>Suggest a heavier weight when I reach my rep goal</span>
          </label>
          {auto && (
            <>
              <p className="label">Add this many pounds (decimals are fine)</p>
              <NumberField decimal label="Pounds to add" value={increment} onChange={setIncrement} />
              <p className="label">Rep goal</p>
              <NumberField label="Rep goal" value={goal} onChange={setGoal} />
              <p className="hint">The weight goes up when any set at your heaviest weight reaches {goal || DEFAULT_REP_GOAL} reps and the average is at least half a rep under that.</p>
            </>
          )}
          {!auto && <p className="hint">The app will keep suggesting the same weight as last time.</p>}
        </>
      )}

      <label className="label" htmlFor="enotes">Notes for yourself (shown on the exercise during a workout)</label>
      <textarea id="enotes" className="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="For example: slow and controlled, breathe out on the way up" />

      {error && <p className="banner err" role="alert">{error}</p>}
      <button className="btn primary big" onClick={save}>{existing ? 'Save changes' : 'Add to workout'}</button>
      <button className="btn" onClick={onDone}>Cancel</button>
      {existing && <button className="btn danger" onClick={archive}>Archive this exercise</button>}
    </>
  );
}

// ---------------------------------------------------------------- archived exercises

function ArchivedScreen({ exercises, onBack }: { exercises: Exercise[]; onBack: () => void }) {
  const archived = exercises.filter((e) => !e.deletedAt && e.archived).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <h1>Archived exercises</h1>
      <p>These are hidden from your workouts, but all their past workouts and charts are still there. Restore one to use it again.</p>
      {archived.length === 0 && <p className="card">Nothing is archived.</p>}
      {archived.map((e) => (
        <section className="card" key={e.id}>
          <h2>{e.name}</h2>
          <p className="muted">{kindShort[e.kind]}</p>
          <button className="btn" onClick={() => setArchived(e.id, false)}>Restore</button>
        </section>
      ))}
      <button className="btn" onClick={onBack}>Back</button>
    </>
  );
}
