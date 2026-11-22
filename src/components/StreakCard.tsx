import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { todayLocal } from '../lib/dates';
import { streakInfo } from '../lib/stats';

const weeks = (n: number) => (n === 1 ? '1 week' : `${n} weeks`);
const workouts = (n: number) => (n === 1 ? '1 more workout' : `${n} more workouts`);

/** The weekly streak: workouts this week out of the goal, and how many weeks in a row she has reached it. */
export default function StreakCard() {
  const all = useLiveQuery(() => db.workouts.toArray(), [], []);
  const s = streakInfo(all, todayLocal());

  let message: string;
  if (s.thisWeekDone) {
    message = s.current === 1
      ? `You reached ${s.goal} workouts this week. Your streak has started!`
      : `You reached ${s.goal} workouts this week. Your streak continues!`;
  } else if (s.current > 0) {
    message = `Your streak is alive. ${workouts(s.toGo)} this week keeps it going.`;
  } else {
    message = `Work out ${s.goal} times in a week to start a streak. ${workouts(s.toGo)} to go this week.`;
  }

  return (
    <section className="card streak" aria-label="Weekly streak">
      <h2>Weekly streak</h2>
      <p className="streak-count"><span className="big-number">{s.current}</span> {s.current === 1 ? 'week' : 'weeks'} in a row</p>
      <p className="muted">This week: {Math.min(s.thisWeek, s.goal)} of {s.goal} workouts</p>
      <div className="dots" role="img" aria-label={`${Math.min(s.thisWeek, s.goal)} of ${s.goal} workouts this week`}>
        {Array.from({ length: s.goal }, (_, i) => <span key={i} className={i < s.thisWeek ? 'dot on' : 'dot'} />)}
      </div>
      <p className={s.thisWeekDone ? 'suggest' : ''}>{message}</p>
      {s.best > s.current && <p className="muted">Best streak: {weeks(s.best)}</p>}
    </section>
  );
}
