import type { DraftEntry } from '../types';
import NumberField from './NumberField';

/** The grid of set rows for one exercise. The boxes depend on how the exercise is counted. */
export default function SetRows({ entry, onCell }: {
  entry: Pick<DraftEntry, 'name' | 'kind' | 'rows'>;
  onCell: (rowIndex: number, field: 'weight' | 'reps' | 'seconds', value: string) => void;
}) {
  const { kind } = entry;
  const cls = kind === 'weightReps' ? 'row' : 'row one';
  return (
    <div className="rows">
      <div className={cls + ' head'}>
        <span />
        {kind === 'weightReps' && <span>Weight (lb)</span>}
        <span>{kind === 'timedHold' ? 'Seconds' : 'Reps'}</span>
      </div>
      {entry.rows.map((r, i) => (
        <div className={cls} key={i}>
          <span className="setno">Set {i + 1}</span>
          {kind === 'weightReps' && (
            <NumberField decimal label={`${entry.name} set ${i + 1} weight in pounds`} value={r.weight} onChange={(v) => onCell(i, 'weight', v)} />
          )}
          {kind === 'timedHold' ? (
            <NumberField label={`${entry.name} set ${i + 1} seconds held`} value={r.seconds} onChange={(v) => onCell(i, 'seconds', v)} />
          ) : (
            <NumberField label={`${entry.name} set ${i + 1} reps`} value={r.reps} onChange={(v) => onCell(i, 'reps', v)} />
          )}
        </div>
      ))}
    </div>
  );
}
