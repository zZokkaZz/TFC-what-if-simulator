import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Inputs } from '../model/types';
import { SyncController, type SyncState } from '../sync/controller';
import { FirebaseBackend } from '../sync/firebaseBackend';
import { BroadcastHub, MockBackend } from '../sync/mockBackend';
import { makeSanitizer } from '../sync/sanitize';
import type { Backend } from '../sync/types';
import { clientId, useMockBackend, type Session } from './session';

let fbBackend: FirebaseBackend | null = null;
let mockHub: BroadcastHub | null = null;

function backend(): Backend {
  if (useMockBackend()) {
    mockHub ??= new BroadcastHub();
    return new MockBackend(mockHub, `mock-${clientId()}`);
  }
  fbBackend ??= new FirebaseBackend();
  return fbBackend;
}

/** Tạo controller khi ở chế độ nhóm; trả về null ở chế độ một mình. */
export function useSync(session: Session | null, base: Inputs): { ctl: SyncController | null; state: SyncState | null } {
  const ctl = useMemo(() => {
    if (!session || session.mode !== 'team') return null;
    try {
      return new SyncController(backend(), base, { team: session.team, role: session.role, clientId: clientId(), sanitize: makeSanitizer(base) });
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [session?.mode, session?.team, session?.role]);
  const [state, setState] = useState<SyncState | null>(null);
  useEffect(() => {
    if (!ctl) { setState(null); return; }
    const unsub = ctl.subscribe(setState);
    void ctl.start();
    const flush = () => void ctl.flushAll();
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); void ctl.flushAll(); unsub(); ctl.stop(); };
  }, [ctl]);
  return { ctl, state };
}
