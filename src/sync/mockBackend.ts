// Backend GIẢ LẬP (không cần mạng):
//  - MemoryHub: dùng chung trong một tiến trình → unit test nhiều "máy" cùng lúc.
//  - BroadcastHub: localStorage + BroadcastChannel → thử 2 tab thật trên cùng máy (?mock=1).
import type { Backend, Dept, DeptDoc, LogEntry, Snapshot, Unsub } from './types';

interface TeamData {
  decisions: Partial<Record<Dept, DeptDoc>>;
  log: LogEntry[];
  snapshots: Snapshot[];
}

export interface Hub {
  read(team: string): TeamData;
  write(team: string, f: (t: TeamData) => void): void;
  listen(team: string, cb: () => void): Unsub;
  now(): number;
}

const empty = (): TeamData => ({ decisions: {}, log: [], snapshots: [] });

export class MemoryHub implements Hub {
  private teams = new Map<string, TeamData>();
  private subs = new Map<string, Set<() => void>>();
  private t = 1_700_000_000_000;
  read(team: string) { return this.teams.get(team) ?? empty(); }
  write(team: string, f: (t: TeamData) => void) {
    const d = structuredClone(this.read(team));
    f(d);
    this.teams.set(team, d);
    this.subs.get(team)?.forEach((cb) => cb());
  }
  listen(team: string, cb: () => void) {
    if (!this.subs.has(team)) this.subs.set(team, new Set());
    this.subs.get(team)!.add(cb);
    return () => { this.subs.get(team)?.delete(cb); };
  }
  now() { return (this.t += 1000); }
}

export class BroadcastHub implements Hub {
  private ch: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tfc-sim-mock') : null;
  private key = (team: string) => `tfc-sim:mock:${team}`;
  read(team: string): TeamData {
    try { return JSON.parse(localStorage.getItem(this.key(team)) ?? 'null') ?? empty(); } catch { return empty(); }
  }
  write(team: string, f: (t: TeamData) => void) {
    const d = this.read(team);
    f(d);
    try { localStorage.setItem(this.key(team), JSON.stringify(d)); } catch { /* bỏ qua */ }
    this.ch?.postMessage(team);
    this.local.get(team)?.forEach((cb) => cb());
  }
  private local = new Map<string, Set<() => void>>();
  listen(team: string, cb: () => void) {
    if (!this.local.has(team)) this.local.set(team, new Set());
    this.local.get(team)!.add(cb);
    const h = (e: MessageEvent) => { if (e.data === team) cb(); };
    this.ch?.addEventListener('message', h);
    return () => { this.local.get(team)?.delete(cb); this.ch?.removeEventListener('message', h); };
  }
  now() { return Date.now(); }
}

let idSeq = 0;
export class MockBackend implements Backend {
  readonly kind = 'mock' as const;
  constructor(private hub: Hub, private uid = `mock-${Math.random().toString(36).slice(2, 8)}`) {}
  async init() { return { uid: this.uid }; }
  watchDecisions(team: string, cb: (d: Partial<Record<Dept, DeptDoc>>, m: { fromCache: boolean; pendingWrites: boolean }) => void): Unsub {
    const fire = () => cb(structuredClone(this.hub.read(team).decisions), { fromCache: false, pendingWrites: false });
    fire();
    return this.hub.listen(team, fire);
  }
  async writeDecision(team: string, dept: Dept, doc: Omit<DeptDoc, 'updatedAt'>) {
    const at = this.hub.now();
    this.hub.write(team, (t) => { t.decisions[dept] = { ...structuredClone(doc), updatedAt: at }; });
  }
  watchLog(team: string, limit: number, cb: (e: LogEntry[]) => void): Unsub {
    const fire = () => cb(this.hub.read(team).log.slice(-limit).reverse());
    fire();
    return this.hub.listen(team, fire);
  }
  async addLog(team: string, entry: Omit<LogEntry, 'id' | 'at'>) {
    const at = this.hub.now();
    this.hub.write(team, (t) => { t.log.push({ ...structuredClone(entry), id: `l${++idSeq}-${at}`, at }); });
  }
  watchSnapshots(team: string, cb: (s: Snapshot[]) => void): Unsub {
    const fire = () => cb([...this.hub.read(team).snapshots].reverse());
    fire();
    return this.hub.listen(team, fire);
  }
  async addSnapshot(team: string, snap: Omit<Snapshot, 'id' | 'at'>) {
    const at = this.hub.now();
    this.hub.write(team, (t) => { t.snapshots.push({ ...structuredClone(snap), id: `s${++idSeq}-${at}`, at }); });
  }
  async deleteSnapshot(team: string, id: string) {
    this.hub.write(team, (t) => { t.snapshots = t.snapshots.filter((s) => s.id !== id); });
  }
  onNetwork(cb: (online: boolean) => void): Unsub {
    cb(true);
    return () => {};
  }
}
