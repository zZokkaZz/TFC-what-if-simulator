// Backend Firebase: Anonymous Auth + Firestore (cache offline IndexedDB nếu trình duyệt cho phép).
// SDK được bundle vào dist/index.html (không tải CDN lúc chạy). Gói Spark: không Functions, không Hosting.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  doc, setDoc, addDoc, deleteDoc, collection, onSnapshot, query, orderBy, limit as qLimit,
  serverTimestamp, Timestamp, connectFirestoreEmulator, type Firestore, type DocumentData,
} from 'firebase/firestore';
import type { Backend, Dept, DeptDoc, LogEntry, Snapshot, Unsub } from './types';
import { DEPTS } from './types';
import { firebaseConfig } from './firebaseConfig';

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);

export class FirebaseBackend implements Backend {
  readonly kind = 'firebase' as const;
  private app: FirebaseApp;
  private db: Firestore;
  persistence: 'indexeddb' | 'memory' = 'indexeddb';

  /** `appName`: chỉ dùng khi cần nhiều phiên trong một tiến trình (script kiểm thử). */
  constructor(appName?: string, emulator?: { firestoreHost: string; firestorePort: number; authUrl: string }) {
    this.app = appName ? initializeApp(firebaseConfig, appName) : initializeApp(firebaseConfig);
    if (emulator) connectAuthEmulator(getAuth(this.app), emulator.authUrl, { disableWarnings: true });
    let db: Firestore;
    try {
      db = initializeFirestore(this.app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    } catch {
      this.persistence = 'memory';
      db = initializeFirestore(this.app, { localCache: memoryLocalCache() });
    }
    if (emulator) connectFirestoreEmulator(db, emulator.firestoreHost, emulator.firestorePort);
    this.db = db;
  }

  async init(): Promise<{ uid: string }> {
    const auth = getAuth(this.app);
    if (auth.currentUser) return { uid: auth.currentUser.uid };
    const existing = await new Promise<string | null>((res) => {
      const u = onAuthStateChanged(auth, (user) => { u(); res(user?.uid ?? null); });
    });
    if (existing) return { uid: existing };
    const cred = await signInAnonymously(auth);
    return { uid: cred.user.uid };
  }

  private teamCol(team: string, sub: 'decisions' | 'log' | 'snapshots') {
    return collection(this.db, 'teams', team, sub);
  }

  watchDecisions(team: string, cb: (d: Partial<Record<Dept, DeptDoc>>, m: { fromCache: boolean; pendingWrites: boolean }) => void, onError: (e: Error) => void): Unsub {
    return onSnapshot(this.teamCol(team, 'decisions'), { includeMetadataChanges: true }, (snap) => {
      const out: Partial<Record<Dept, DeptDoc>> = {};
      snap.forEach((d) => {
        if (!DEPTS.includes(d.id as Dept)) return;
        const x = d.data({ serverTimestamps: 'estimate' }) as DocumentData;
        out[d.id as Dept] = { data: x.data, uid: String(x.uid ?? ''), role: x.role, clientId: String(x.clientId ?? ''), rev: Number(x.rev ?? 0), updatedAt: ms(x.updatedAt) };
      });
      cb(out, { fromCache: snap.metadata.fromCache, pendingWrites: snap.metadata.hasPendingWrites });
    }, onError);
  }

  async writeDecision(team: string, dept: Dept, d: Omit<DeptDoc, 'updatedAt'>) {
    await setDoc(doc(this.db, 'teams', team, 'decisions', dept), { ...d, updatedAt: serverTimestamp() });
  }

  watchLog(team: string, limit: number, cb: (e: LogEntry[]) => void, onError: (e: Error) => void): Unsub {
    return onSnapshot(query(this.teamCol(team, 'log'), orderBy('at', 'desc'), qLimit(limit)), (snap) => {
      cb(snap.docs.map((d) => {
        const x = d.data({ serverTimestamps: 'estimate' });
        return { id: d.id, at: ms(x.at), uid: x.uid, role: x.role, dept: x.dept, summary: String(x.summary ?? ''), changes: Array.isArray(x.changes) ? x.changes : [] };
      }));
    }, onError);
  }

  async addLog(team: string, entry: Omit<LogEntry, 'id' | 'at'>) {
    await addDoc(this.teamCol(team, 'log'), { ...entry, at: serverTimestamp() });
  }

  watchSnapshots(team: string, cb: (s: Snapshot[]) => void, onError: (e: Error) => void): Unsub {
    return onSnapshot(query(this.teamCol(team, 'snapshots'), orderBy('at', 'desc'), qLimit(30)), (snap) => {
      cb(snap.docs.map((d) => {
        const x = d.data({ serverTimestamps: 'estimate' });
        return { id: d.id, name: String(x.name ?? ''), at: ms(x.at), uid: x.uid, role: x.role, inputs: x.inputs };
      }));
    }, onError);
  }

  async addSnapshot(team: string, s: Omit<Snapshot, 'id' | 'at'>) {
    await addDoc(this.teamCol(team, 'snapshots'), { ...s, at: serverTimestamp() });
  }

  async deleteSnapshot(team: string, id: string) {
    await deleteDoc(doc(this.db, 'teams', team, 'snapshots', id));
  }

  onNetwork(cb: (online: boolean) => void): Unsub {
    if (typeof window === 'undefined') { cb(true); return () => {}; }
    const on = () => cb(true), off = () => cb(false);
    cb(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }
}
