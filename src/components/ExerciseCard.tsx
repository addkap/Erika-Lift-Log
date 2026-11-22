import type { DraftEntry } from '../types';
import type { Hint } from '../lib/progression';
import SetRows from './SetRows';

interface Props {
  entry: DraftEntry;
  hint: Hint;
  isFirst: boolean;
  isLast: boolean;
  onCell: (rowIndex: number, field: 'weight' | 'reps' | 'seconds', value: string) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

/** One exercise: name, PT notes, last time, suggestion, set rows, and the buttons to change them. */
export default function ExerciseCard({ entry, hint, isFirst, isLast, onCell, onAddSet, onRemoveSet, onMove, onRemove }: Props) {
  const range = entry.minSets === entry.maxSets ? `${entry.minSets}` : `${entry.minSets}-${entry.maxSets}`;
  return (
    <section className="card">
      <h2>{entry.name}</h2>
      {entry.notes && <p className="notes">{entry.notes}</p>}
      <p>Recommended: {range} sets</p>
      <p className="muted">{hint.lastText}</p>
      {hint.suggestionText && <p className="suggest">{hint.suggestionText}</p>}

      <SetRows entry={entry} onCell={onCell} />

      <div className="btns">
        <button className="btn" onClick={onAddSet}>Add set</button>
        <button className="btn" onClick={onRemoveSet} disabled={entry.rows.length <= 1}>Remove last set</button>
      </div>
      <div className="btns">
        <button className="btn small" onClick={() => onMove(-1)} disabled={isFirst}>Move up</button>
        <button className="btn small" onClick={() => onMove(1)} disabled={isLast}>Move down</button>
        <button className="btn small danger" onClick={onRemove}>Skip exercise</button>
      </div>
    </section>
  );
}
