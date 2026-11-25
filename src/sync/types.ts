// Kiểu dữ liệu đồng bộ nhóm. Đường dẫn Firestore: teams/{mãĐội}/decisions|log|snapshots/...
import type { Inputs } from '../model/types';

export type Dept = 'ops' | 'sc' | 'purchasing' | 'sales';
export type Role = Dept | 'viewer';

export const DEPTS: Dept[] = ['purchasing', 'ops', 'sales', 'sc'];
export const ROLE_LABEL: Record<Role, string> = {
  purchasing: 'Purchasing',
  ops: 'Operations',
  sales: 'Sales',
  sc: 'Supply Chain',
  viewer: 'Xem',
};
export const DEPT_SHORT: Record<Dept, string> = { purchasing: 'Purchasing', ops: 'Ops', sales: 'Sales', sc: 'SC' };

/** Mã đội: 8–64 ký tự chữ, số, gạch ngang, gạch dưới (khớp firestore.rules). */
export const TEAM_CODE_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface DeptDoc {
  data: unknown;
  uid: string;
  role: Role;
  clientId: string;
  rev: number;
  updatedAt: number | null; // ms
}

export interface LogChange {
  path: string;
  label: string;
  from: string;
  to: string;
}

export interface LogEntry {
  id: string;
  at: number | null;
  uid: string;
  role: Role;
  dept: Dept;
  summary: string;
  changes: LogChange[];
}

export interface Snapshot {
  id: string;
  name: string;
  at: number | null;
  uid: string;
  role: Role;
  inputs: Inputs;
}

export type ConnStatus = 'connecting' | 'synced' | 'pending' | 'offline' | 'error';

export type Unsub = () => void;

export interface Backend {
  readonly kind: 'firebase' | 'mock';
  init(): Promise<{ uid: string }>;
  watchDecisions(team: string, cb: (docs: Partial<Record<Dept, DeptDoc>>, meta: { fromCache: boolean; pendingWrites: boolean }) => void, onError: (e: Error) => void): Unsub;
  writeDecision(team: string, dept: Dept, doc: Omit<DeptDoc, 'updatedAt'>): Promise<void>;
  watchLog(team: string, limit: number, cb: (entries: LogEntry[]) => void, onError: (e: Error) => void): Unsub;
  addLog(team: string, entry: Omit<LogEntry, 'id' | 'at'>): Promise<void>;
  watchSnapshots(team: string, cb: (snaps: Snapshot[]) => void, onError: (e: Error) => void): Unsub;
  addSnapshot(team: string, snap: Omit<Snapshot, 'id' | 'at'>): Promise<void>;
  deleteSnapshot(team: string, id: string): Promise<void>;
  /** Trạng thái mạng của trình duyệt/SDK (true = online). */
  onNetwork(cb: (online: boolean) => void): Unsub;
}
