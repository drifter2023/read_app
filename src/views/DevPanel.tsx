import { useEffect, useState } from 'react';
import type { PrefsStore, Tier } from '../core/prefs/prefs.ts';

/** Developer-only: force the render tier. Shown with ?dev=1 or a VITE_DEV_TOOLS build. */
export function DevPanel({ prefs }: { prefs: PrefsStore }) {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe((next) => setP(next)), [prefs]);
  return (
    <div className="dev-panel" onClick={(e) => e.stopPropagation()}>
      <label>tier{' '}
        <select value={p.tier ?? ''} onChange={(e) => void prefs.set('tier', (e.target.value || null) as Tier | null)}>
          <option value="">probe</option><option value="full">full</option><option value="fallback">fallback</option>
        </select>
      </label>
    </div>
  );
}
