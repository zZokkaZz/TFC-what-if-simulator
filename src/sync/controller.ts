// Bộ điều khiển đồng bộ: giữ "bản chung", kịch bản riêng, ghi trễ ~500 ms, nhật ký, snapshot, xung đột.
// Không phụ thuộc Firebase: nhận một Backend (Firebase thật hoặc giả lập) → test được bằng Vitest.
import type { Inputs } from '../model/types';
import type { Backend, ConnStatus, Dept, DeptDoc, LogEntry, Role, Snapshot, Unsub } from './types';
import { DEPTS, DEPT_SHORT, ROLE_LABEL } from './types';
import { diffDept, summarize } from './diff';
import { describeIssues, type Issue } from './limits';

export interface Notice {
  id: number;
  kind: 'conflict' | 'info' | 'error';
  text: string;
  at: number;
  count: number; // số lần lặp lại (thông báo trùng được gộp)
}

/** Trạng thái lưu của từng phòng lên bản chung. */
export interface DeptSave {
  state: 'idle' | 'pending' | 'saved' | 'error';
  at: number | null; // lúc lưu xong / lúc lỗi
  message?: string;
  issues?: Issue[];
}

export interface ErrorEntry {
  id: number;
  at: number;
  dept: Dept | null;
  text: string;
  detail?: string; // mã lỗi gốc để gửi cho người sửa app
}

export interface SyncState {
  ready: boolean;
  uid: string | null;
  team: string;
  role: Role;
  shared: Inputs;
  local: Inputs | null; // khác null = đang ở kịch bản riêng
  sharedChangedWhileLocal: boolean;
  status: ConnStatus;
  pending: Dept[];
  meta: Partial<Record<Dept, { updatedAt: number | null; role: Role; clientId: string; rev: number }>>;
  log: LogEntry[];
  snapshots: Snapshot[];
  notices: Notice[];
  error: string | null;
  saves: Record<Dept, DeptSave>;
  errors: ErrorEntry[]; // 30 lỗi gần nhất (chỉ trên máy này)
}

export interface ControllerOptions {
  team: string;
  role: Role;
  clientId: string;
  debounceMs?: number;
  logLimit?: number;
  /** Làm sạch dữ liệu nhận về (ghép lên baseline, bỏ khóa lạ). */
  sanitize: (dept: Dept, data: unknown) => unknown;
  /** Kiểm tra trước khi ghi; có lỗi thì KHÔNG gửi lên Firebase. */
  validate?: (dept: Dept, data: unknown) => Issue[];
  now?: () => number;
}

const rawErr = (e: unknown) => `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? String(e)}`.trim();

function friendly(e: unknown): string {
  const m = rawErr(e);
  if (/permission/i.test(m)) return 'Firebase từ chối quyền — có thể có ô vượt giới hạn, rules chưa Publish/đã đổi, hoặc mã đội sai định dạng (8–64 ký tự: chữ, số, - _).';
  if (/unavailable|network|offline|failed to fetch/i.test(m)) return 'Không kết nối được Firebase (mất mạng?). Số vẫn giữ trên máy, có mạng sẽ tự gửi.';
  if (/quota|resource-exhausted/i.test(m)) return 'Hết hạn mức miễn phí của Firebase hôm nay (gói Spark). Thử lại sau.';
  if (/unauthenticated|auth/i.test(m)) return 'Chưa đăng nhập được Firebase (Anonymous Auth có đang bật?).';
  return m;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const CONFLICT_WINDOW_MS = 15_000;

export class SyncController {
  private state: SyncState;
  private listeners = new Set<(s: SyncState) => void>();
  private timers: Partial<Record<Dept, ReturnType<typeof setTimeout>>> = {};
  private inflight = new Set<Dept>();
  private dirty = new Set<Dept>();
  private lastRemote: Partial<Record<Dept, unknown>> = {};
  private lastEditAt: Partial<Record<Dept, number>> = {};
  private unsubs: Unsub[] = [];
  private online = true;
  private fromCache = true;
  private sdkPendingWrites = false;
  private noticeSeq = 0;
  private revs: Partial<Record<Dept, number>> = {};
  /** rev cao nhất PHIÊN NÀY đã ghi cho từng phòng — để nhận ra "tiếng vọng" của chính lần ghi này. */
  private writtenRevs: Partial<Record<Dept, number>> = {};
  private readonly debounceMs: number;
  private readonly now: () => number;

  constructor(private backend: Backend, base: Inputs, private opts: ControllerOptions) {
    this.debounceMs = opts.debounceMs ?? 500;
    this.now = opts.now ?? (() => Date.now());
    this.state = {
      ready: false, uid: null, team: opts.team, role: opts.role,
      shared: clone(base), local: null, sharedChangedWhileLocal: false,
      status: 'connecting', pending: [], meta: {}, log: [], snapshots: [], notices: [], error: null,
      saves: Object.fromEntries(DEPTS.map((d) => [d, { state: 'idle', at: null }])) as Record<Dept, DeptSave>,
      errors: [],
    };
    for (const d of DEPTS) this.lastRemote[d] = clone(base[d]);
  }

  // ---------- vòng đời ----------
  async start(): Promise<void> {
    try {
      const { uid } = await this.backend.init();
      this.set({ uid });
    } catch (e) {
      const text = `Không đăng nhập được Firebase: ${friendly(e)}`;
      this.recordError(null, text, rawErr(e));
      this.set({ status: 'error', error: text });
      return;
    }
    const onErr = (e: Error) => { const t = friendly(e); this.recordError(null, `Lỗi đọc dữ liệu nhóm: ${t}`, rawErr(e)); this.set({ status: 'error', error: t }); };
    this.unsubs.push(this.backend.watchDecisions(this.opts.team, (docs, meta) => this.onDecisions(docs, meta), onErr));
    this.unsubs.push(this.backend.watchLog(this.opts.team, this.opts.logLimit ?? 50, (log) => this.set({ log }), onErr));
    this.unsubs.push(this.backend.watchSnapshots(this.opts.team, (snapshots) => this.set({ snapshots }), onErr));
    this.unsubs.push(this.backend.onNetwork((online) => { this.online = online; this.refreshStatus(); }));
  }

  stop() {
    for (const d of DEPTS) if (this.timers[d]) { clearTimeout(this.timers[d]); this.timers[d] = undefined; }
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  subscribe(fn: (s: SyncState) => void): Unsub {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  getState() { return this.state; }

  /** Inputs đang hiển thị: kịch bản riêng nếu có, nếu không là bản chung. */
  current(): Inputs { return this.state.local ?? this.state.shared; }

  canEditShared(dept: Dept) { return this.opts.role === dept; }
  canEdit(dept: Dept) { return this.state.local !== null || this.canEditShared(dept); }

  // ---------- sửa bản chung ----------
  editShared(dept: Dept, data: unknown) {
    if (!this.canEditShared(dept)) {
      this.notice('error', `Vai trò ${ROLE_LABEL[this.opts.role]} không được sửa phần ${DEPT_SHORT[dept]}.`);
      return;
    }
    this.lastEditAt[dept] = this.now();
    this.set({ shared: { ...this.state.shared, [dept]: clone(data) } as Inputs });
    if (this.timers[dept]) clearTimeout(this.timers[dept]);
    const issues = this.opts.validate?.(dept, data) ?? [];
    if (issues.length) {
      // Không gửi lên Firebase: báo rõ ô nào, số nào, giới hạn bao nhiêu
      this.dirty.delete(dept);
      const text = `Chưa lưu phần ${DEPT_SHORT[dept]} lên bản chung: ${describeIssues(issues)}. Sửa lại ô này thì app tự lưu.`;
      this.setSave(dept, { state: 'error', at: this.now(), message: text, issues });
      this.recordError(dept, text);
      this.notice('error', text);
      this.refreshStatus();
      return;
    }
    this.dirty.add(dept);
    this.setSave(dept, { state: 'pending', at: this.state.saves[dept].at });
    this.timers[dept] = setTimeout(() => void this.flush(dept), this.debounceMs);
    this.refreshStatus();
  }

  /** Bỏ thay đổi chưa lưu được của một phòng, quay về bản đã lưu gần nhất trên máy chủ. */
  revertDept(dept: Dept) {
    if (this.timers[dept]) { clearTimeout(this.timers[dept]); this.timers[dept] = undefined; }
    this.dirty.delete(dept);
    this.set({ shared: { ...this.state.shared, [dept]: clone(this.lastRemote[dept]) } as Inputs });
    this.setSave(dept, { state: this.state.meta[dept] ? 'saved' : 'idle', at: this.state.meta[dept]?.updatedAt ?? null });
    this.refreshStatus();
  }

  clearErrors() { this.set({ errors: [] }); }

  /** Ghi ngay phần của một phòng (bỏ qua thời gian chờ). */
  async flush(dept: Dept): Promise<void> {
    if (this.timers[dept]) { clearTimeout(this.timers[dept]); this.timers[dept] = undefined; }
    if (!this.dirty.has(dept)) return;
    this.dirty.delete(dept);
    const data = clone(this.state.shared[dept]);
    const before = this.lastRemote[dept];
    const changes = diffDept(dept, before, data);
    this.lastRemote[dept] = data;
    const rev = (this.revs[dept] ?? this.state.meta[dept]?.rev ?? 0) + 1;
    this.revs[dept] = rev;
    this.writtenRevs[dept] = Math.max(this.writtenRevs[dept] ?? 0, rev);
    this.inflight.add(dept);
    this.refreshStatus();
    const uid = this.state.uid ?? 'unknown';
    try {
      await this.backend.writeDecision(this.opts.team, dept, { data, uid, role: this.opts.role, clientId: this.opts.clientId, rev });
      // Chỉ ghi nhật ký khi bản chung đã nhận thay đổi
      if (changes.length) void this.backend.addLog(this.opts.team, { uid, role: this.opts.role, dept, summary: summarize(dept, changes), changes }).catch((e) => {
        const t = `Đã lưu phần ${DEPT_SHORT[dept]} nhưng không ghi được nhật ký: ${friendly(e)}`;
        this.recordError(dept, t, rawErr(e));
      });
      if (!this.dirty.has(dept)) this.setSave(dept, { state: 'saved', at: this.now() });
    } catch (e) {
      this.lastRemote[dept] = before;
      const where = changes.length ? ` (thay đổi: ${changes.slice(0, 3).map((c) => `${c.label} ${c.from} → ${c.to}`).join('; ')})` : '';
      const text = `Không lưu được phần ${DEPT_SHORT[dept]}${where}: ${friendly(e)}`;
      this.setSave(dept, { state: 'error', at: this.now(), message: text });
      this.recordError(dept, text, rawErr(e));
      this.notice('error', text);
    } finally {
      this.inflight.delete(dept);
      this.refreshStatus();
    }
  }

  async flushAll() { await Promise.all(DEPTS.map((d) => this.flush(d))); }

  // ---------- kịch bản riêng ----------
  enterLocal(from?: Inputs) {
    this.set({ local: clone(from ?? this.state.shared), sharedChangedWhileLocal: false });
  }

  editLocal(next: Inputs) {
    if (!this.state.local) this.enterLocal();
    this.set({ local: clone(next) });
  }

  /** Các phòng trong kịch bản riêng khác bản chung. */
  localDiffDepts(): Dept[] {
    const l = this.state.local;
    if (!l) return [];
    return DEPTS.filter((d) => !same(l[d], this.state.shared[d]));
  }

  /** Đẩy phần của vai trò mình từ kịch bản riêng lên bản chung, rồi quay về bản chung. */
  async pushLocal(): Promise<{ pushed: Dept | null; skipped: Dept[] }> {
    const l = this.state.local;
    const role = this.opts.role;
    if (!l) return { pushed: null, skipped: [] };
    const skipped = this.localDiffDepts().filter((d) => d !== role);
    if (role === 'viewer') {
      this.notice('error', 'Vai trò Xem không đẩy được lên bản chung.');
      return { pushed: null, skipped };
    }
    const pushed = !same(l[role], this.state.shared[role]) ? role : null;
    this.set({ local: null, sharedChangedWhileLocal: false });
    if (pushed) {
      this.editShared(role, l[role]);
      await this.flush(role);
    }
    return { pushed, skipped };
  }

  discardLocal() { this.set({ local: null, sharedChangedWhileLocal: false }); }

  // ---------- snapshot ----------
  async takeSnapshot(name: string) {
    await this.flushAll();
    const n = name.trim().slice(0, 80) || new Date(this.now()).toLocaleString('vi-VN');
    try {
      await this.backend.addSnapshot(this.opts.team, { name: n, uid: this.state.uid ?? 'unknown', role: this.opts.role, inputs: clone(this.state.shared) });
      this.notice('info', `Đã chụp bản chung "${n}".`);
    } catch (e) {
      const t = `Không chụp được bản chung "${n}": ${friendly(e)}`;
      this.recordError(null, t, rawErr(e));
      this.notice('error', t);
    }
  }

  async deleteSnapshot(id: string) {
    try { await this.backend.deleteSnapshot(this.opts.team, id); } catch (e) {
      const t = `Không xóa được bản chụp: ${friendly(e)}`;
      this.recordError(null, t, rawErr(e));
      this.notice('error', t);
    }
  }

  /** Mở snapshot trong kịch bản riêng (mỗi vai trò tự đẩy phần mình nếu muốn khôi phục). */
  /** Bộ quyết định của một snapshot, đã làm sạch (khóa lạ/sai kiểu bị bỏ). */
  snapshotInputs(s: Snapshot): Inputs {
    const inputs = clone(this.state.shared);
    for (const d of DEPTS) (inputs as unknown as Record<Dept, unknown>)[d] = this.opts.sanitize(d, (s.inputs as unknown as Record<Dept, unknown>)?.[d]);
    return inputs;
  }

  openSnapshotLocal(id: string) {
    const s = this.state.snapshots.find((x) => x.id === id);
    if (!s) return;
    this.enterLocal(this.snapshotInputs(s));
    this.notice('info', `Đang xem "${s.name}" trong kịch bản riêng. Bấm "Đẩy lên bản chung" để khôi phục phần ${DEPT_SHORT[this.opts.role as Dept] ?? ''} của bạn.`);
  }

  dismissNotice(id: number) { this.set({ notices: this.state.notices.filter((n) => n.id !== id) }); }

  // ---------- nhận dữ liệu từ máy chủ ----------
  private onDecisions(docs: Partial<Record<Dept, DeptDoc>>, meta: { fromCache: boolean; pendingWrites: boolean }) {
    this.fromCache = meta.fromCache;
    this.sdkPendingWrites = meta.pendingWrites;
    let shared = this.state.shared;
    let changedWhileLocal = this.state.sharedChangedWhileLocal;
    const metaOut = { ...this.state.meta };
    for (const d of DEPTS) {
      const doc = docs[d];
      if (!doc) continue;
      const data = this.opts.sanitize(d, doc.data);
      const mine = doc.clientId === this.opts.clientId;
      metaOut[d] = { updatedAt: doc.updatedAt, role: doc.role, clientId: doc.clientId, rev: doc.rev };
      if (this.state.saves[d].state === 'idle') this.setSave(d, { state: 'saved', at: doc.updatedAt });
      if ((this.revs[d] ?? 0) < doc.rev) this.revs[d] = doc.rev; // cả bản ghi cùng clientId (F5, tab khác) → lần ghi sau có rev lớn hơn
      const busy = this.dirty.has(d) || this.inflight.has(d);
      // Chỉ bỏ qua bản ghi của CHÍNH PHIÊN NÀY (rev ≤ rev đã ghi): màn hình đã có số đó (hoặc mới hơn).
      // Sửa lỗi 26/11: trước đây bỏ qua mọi bản ghi cùng clientId → sau F5 (clientId lưu trên máy, màn hình bắt đầu từ R0)
      // quyết định đã lưu của chính mình không hiện lại; tab khác cùng trình duyệt cũng không thấy nhau.
      const ownEcho = mine && this.writtenRevs[d] !== undefined && doc.rev <= this.writtenRevs[d]!;
      if (ownEcho) { this.lastRemote[d] = data; continue; }
      if (busy) {
        this.lastRemote[d] = data;
        if (d === this.opts.role) this.notice('conflict', `Một máy khác (vai trò ${ROLE_LABEL[doc.role]}) vừa ghi phần ${DEPT_SHORT[d]}. Thay đổi đang chờ của bạn sẽ ghi đè lên (bản ghi sau thắng).`);
        continue;
      }
      if (same(shared[d], data)) { this.lastRemote[d] = data; continue; }
      if (d === this.opts.role && this.now() - (this.lastEditAt[d] ?? -Infinity) < CONFLICT_WINDOW_MS) {
        this.notice('conflict', `Một máy khác cùng vai trò ${ROLE_LABEL[doc.role]} vừa ghi đè phần ${DEPT_SHORT[d]} của bạn (bản ghi sau thắng). Màn hình đã cập nhật theo bản mới.`);
      }
      shared = { ...shared, [d]: data } as Inputs;
      this.lastRemote[d] = data;
      if (this.state.local) changedWhileLocal = true;
    }
    this.set({ shared, meta: metaOut, sharedChangedWhileLocal: changedWhileLocal, ready: true });
    this.refreshStatus();
  }

  private refreshStatus() {
    if (this.state.status === 'error' && this.state.error) return;
    const pending = DEPTS.filter((d) => this.dirty.has(d) || this.inflight.has(d));
    let status: ConnStatus;
    if (!this.state.ready) status = this.online ? 'connecting' : 'offline';
    else if (!this.online || this.fromCache) status = 'offline';
    else if (pending.length || this.sdkPendingWrites) status = 'pending';
    else status = 'synced';
    this.set({ status, pending });
  }

  private notice(kind: Notice['kind'], text: string) {
    const last = this.state.notices[this.state.notices.length - 1];
    if (last && last.text === text && last.kind === kind) {
      this.set({ notices: [...this.state.notices.slice(0, -1), { ...last, count: last.count + 1, at: this.now() }] });
      return;
    }
    const n: Notice = { id: ++this.noticeSeq, kind, text, at: this.now(), count: 1 };
    this.set({ notices: [...this.state.notices.filter((x) => x.text !== text).slice(-3), n] });
  }

  private recordError(dept: Dept | null, text: string, detail?: string) {
    const last = this.state.errors[0];
    if (last && last.text === text) return;
    const e: ErrorEntry = { id: ++this.noticeSeq, at: this.now(), dept, text, detail };
    this.set({ errors: [e, ...this.state.errors].slice(0, 30) });
  }

  private setSave(dept: Dept, s: DeptSave) {
    this.set({ saves: { ...this.state.saves, [dept]: s } });
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }
}
