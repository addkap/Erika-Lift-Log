import { useEffect, useState } from 'react';
import BackupSettings from '../components/BackupSettings';
import OneDriveSettings from '../components/OneDriveSettings';
import EditWorkoutsPage from './EditWorkoutsPage';

/** Is the browser promising to keep our saved data? (iPhone only does this for Home Screen apps.) */
function useStorageProtected(): boolean | null {
  const [state, setState] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setState).catch(() => setState(null));
  }, []);
  return state;
}

export default function SettingsPage({ startInEditor = false }: { startInEditor?: boolean }) {
  const protectedStorage = useStorageProtected();
  const [editing, setEditing] = useState(startInEditor);

  if (editing) return <EditWorkoutsPage onBack={() => setEditing(false)} />;

  return (
    <>
      <h1>Settings</h1>

      <button className="btn primary" onClick={() => setEditing(true)}>Edit my workouts</button>

      <section className="card">
        <h2>Phone storage</h2>
        {protectedStorage ? (
          <p>Protected: the phone will keep your workouts safe.</p>
        ) : (
          <p>Not protected yet. Add this app to the Home Screen so the phone keeps your workouts safe.</p>
        )}
      </section>

      <OneDriveSettings />
      <BackupSettings />
    </>
  );
}
