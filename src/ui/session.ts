// Thiết lập trên máy: mã đội, vai trò, chế độ (nhóm / một mình), giả định riêng. Bọc try/catch.
import type { Role } from '../sync/types';
import { TEAM_CODE_RE } from '../sync/types';

export interface Session {
  mode: 'team' | 'solo';
  team: string;
  role: Role;
}

const KEY = 'tfc-sim:session:v1';
const EST_KEY = 'tfc-sim:est:v1';
const CLIENT_KEY = 'tfc-sim:client';

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session | null;
    if (!s) return null;
    if (s.mode === 'team' && !TEAM_CODE_RE.test(s.team)) return null;
    return s;
  } catch { return null; }
}
export function saveSession(s: Session | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* bỏ qua */ }
}

export function loadEst(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(EST_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
export function saveEst(e: Record<string, number>) {
  try { localStorage.setItem(EST_KEY, JSON.stringify(e)); } catch { /* bỏ qua */ }
}

/** Mã phiên trình duyệt (mỗi tab một mã) để nhận ra bản ghi của chính mình. */
export function clientId(): string {
  try {
    const s = sessionStorage.getItem(CLIENT_KEY);
    if (s) return s;
    const id = Math.random().toString(36).slice(2, 12);
    sessionStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch { return Math.random().toString(36).slice(2, 12); }
}

/** ?mock=1 → dùng backend giả lập (localStorage + BroadcastChannel), không cần mạng. */
export function useMockBackend(): boolean {
  try { return new URLSearchParams(location.search).get('mock') === '1'; } catch { return false; }
}
