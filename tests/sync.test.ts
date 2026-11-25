// Test logic đồng bộ bằng backend giả lập (nhiều "máy" dùng chung một MemoryHub).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import { baselineInputs } from '../src/model/simulate';
import { SyncController } from '../src/sync/controller';
import { MemoryHub, MockBackend } from '../src/sync/mockBackend';
import { makeSanitizer } from '../src/sync/sanitize';
import type { Role } from '../src/sync/types';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const sanitize = makeSanitizer(base);
const TEAM = 'test-team-001';

let hub: MemoryHub;
const make = async (role: Role, id: string) => {
  const c = new SyncController(new MockBackend(hub, `uid-${id}`), base, { team: TEAM, role, clientId: id, sanitize, debounceMs: 500 });
  await c.start();
  return c;
};

beforeEach(() => { hub = new MemoryHub(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Đồng bộ bản chung', () => {
  it('Ops sửa số ca → máy SC thấy sau khi hết thời gian chờ 500 ms, kèm nhật ký', async () => {
    const ops = await make('ops', 'A'), sc = await make('sc', 'B');
    ops.editShared('ops', { ...ops.current().ops, shifts: 3 });
    expect(sc.current().ops.shifts).toBe(2); // chưa ghi
    await vi.advanceTimersByTimeAsync(499);
    expect(sc.current().ops.shifts).toBe(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(sc.current().ops.shifts).toBe(3);
    expect(sc.getState().log[0].summary).toBe('Ops đổi số ca 2 → 3');
  });

  it('gõ liên tục chỉ ghi 1 lần (gom ghi)', async () => {
    const ops = await make('ops', 'A');
    const spy = vi.spyOn(MockBackend.prototype, 'writeDecision');
    for (const v of [910, 920, 930, 940]) { ops.editShared('ops', { ...ops.current().ops, rmPalletLocations: v }); await vi.advanceTimersByTimeAsync(100); }
    await vi.advanceTimersByTimeAsync(600);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(hub.read(TEAM).log).toHaveLength(1);
    expect(hub.read(TEAM).log[0].summary).toContain('900 → 940');
    spy.mockRestore();
  });

  it('mỗi vai trò chỉ sửa phần mình; Xem không sửa gì', async () => {
    const sc = await make('sc', 'B'), viewer = await make('viewer', 'V');
    sc.editShared('ops', { ...sc.current().ops, shifts: 5 });
    viewer.editShared('ops', { ...viewer.current().ops, shifts: 5 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(hub.read(TEAM).decisions.ops).toBeUndefined();
    expect(sc.getState().notices.at(-1)?.kind).toBe('error');
  });

  it('2 phòng sửa cùng lúc không ghi đè nhau (document riêng)', async () => {
    const ops = await make('ops', 'A'), sc = await make('sc', 'B'), viewer = await make('viewer', 'V');
    ops.editShared('ops', { ...ops.current().ops, smed: true });
    sc.editShared('sc', { ...sc.current().sc, frozenPeriodWeeks: 2 });
    await vi.advanceTimersByTimeAsync(600);
    expect(viewer.current().ops.smed).toBe(true);
    expect(viewer.current().sc.frozenPeriodWeeks).toBe(2);
    expect(ops.current().sc.frozenPeriodWeeks).toBe(2);
    expect(sc.current().ops.smed).toBe(true);
  });

  it('2 máy cùng vai trò: bản ghi sau thắng, máy kia được báo', async () => {
    const a = await make('ops', 'A'), b = await make('ops', 'B');
    a.editShared('ops', { ...a.current().ops, shifts: 3 });
    await vi.advanceTimersByTimeAsync(600);
    b.editShared('ops', { ...b.current().ops, shifts: 4 });
    await vi.advanceTimersByTimeAsync(600);
    expect(a.current().ops.shifts).toBe(4);
    expect(b.current().ops.shifts).toBe(4);
    expect(a.getState().notices.some((n) => n.kind === 'conflict')).toBe(true);
  });

  it('dữ liệu lạ từ máy chủ bị lọc (khóa lạ, sai kiểu)', async () => {
    const v = await make('viewer', 'V');
    hub.write(TEAM, (t) => { t.decisions.ops = { data: { shifts: 'abc', evil: 1, rmFte: 7 }, uid: 'x', role: 'ops', clientId: 'X', rev: 1, updatedAt: 1 }; });
    expect(v.current().ops.shifts).toBe(2);
    expect(v.current().ops.rmFte).toBe(7);
    expect((v.current().ops as unknown as Record<string, unknown>).evil).toBeUndefined();
  });
});

describe('Kịch bản riêng & snapshot', () => {
  it('kịch bản riêng không làm đổi bản chung; đẩy lên chỉ phần của vai trò mình', async () => {
    const ops = await make('ops', 'A'), sc = await make('sc', 'B');
    ops.enterLocal();
    const l = structuredClone(ops.current());
    l.ops.shifts = 3;
    l.sc.frozenPeriodWeeks = 1; // thử số của SC trên máy mình
    ops.editLocal(l);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sc.current().ops.shifts).toBe(2);
    expect(ops.localDiffDepts().sort()).toEqual(['ops', 'sc']);
    const r = await ops.pushLocal();
    expect(r).toEqual({ pushed: 'ops', skipped: ['sc'] });
    expect(sc.current().ops.shifts).toBe(3);
    expect(sc.current().sc.frozenPeriodWeeks).toBe(3);
    expect(ops.getState().local).toBeNull();
  });

  it('bản chung đổi trong lúc đang ở kịch bản riêng → có cờ báo; Lấy lại bản chung', async () => {
    const ops = await make('ops', 'A'), sc = await make('sc', 'B');
    ops.enterLocal();
    sc.editShared('sc', { ...sc.current().sc, frozenPeriodWeeks: 4 });
    await vi.advanceTimersByTimeAsync(600);
    expect(ops.getState().sharedChangedWhileLocal).toBe(true);
    expect(ops.current().sc.frozenPeriodWeeks).toBe(3);
    ops.discardLocal();
    expect(ops.current().sc.frozenPeriodWeeks).toBe(4);
  });

  it('chụp bản chung, mở lại trong kịch bản riêng', async () => {
    const ops = await make('ops', 'A');
    ops.editShared('ops', { ...ops.current().ops, shifts: 3 });
    await ops.takeSnapshot('R1 – phương án 1');
    expect(ops.getState().snapshots[0].name).toBe('R1 – phương án 1');
    expect(ops.getState().snapshots[0].inputs.ops.shifts).toBe(3);
    ops.editShared('ops', { ...ops.current().ops, shifts: 1 });
    await vi.advanceTimersByTimeAsync(600);
    ops.openSnapshotLocal(ops.getState().snapshots[0].id);
    expect(ops.current().ops.shifts).toBe(3);
    expect(ops.getState().shared.ops.shifts).toBe(1);
  });

  it('nhật ký giữ tối đa 50 dòng mới nhất', async () => {
    const ops = await make('ops', 'A');
    for (let i = 0; i < 60; i++) { ops.editShared('ops', { ...ops.current().ops, rmPalletLocations: 1000 + i }); await vi.advanceTimersByTimeAsync(600); }
    expect(ops.getState().log).toHaveLength(50);
    expect(ops.getState().log[0].summary).toContain('1059');
  });
});

import { validateDept, OPS_LIMITS, PUR_LIMITS, PUR_TEXT, PUR_TEXT_MAX, PUR_COMPONENTS } from '../src/sync/limits';
import { readFileSync } from 'node:fs';

describe('Báo lỗi rõ ràng', () => {
  const mkV = async (role: Role, id: string, backend?: MockBackend) => {
    const c = new SyncController(backend ?? new MockBackend(hub, `uid-${id}`), base, { team: TEAM, role, clientId: id, sanitize, validate: validateDept, debounceMs: 500 });
    await c.start();
    return c;
  };

  it('số vượt giới hạn: không gửi lên Firebase, báo đúng ô + số + giới hạn', async () => {
    const ops = await mkV('ops', 'A');
    const spy = vi.spyOn(MockBackend.prototype, 'writeDecision');
    ops.editShared('ops', { ...ops.current().ops, rmFte: 530 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).not.toHaveBeenCalled();
    const st = ops.getState();
    expect(st.saves.ops.state).toBe('error');
    expect(st.saves.ops.message).toContain('FTE kho NL = 530');
    expect(st.saves.ops.message).toContain('tối đa 200');
    expect(st.errors[0].dept).toBe('ops');
    spy.mockRestore();
  });

  it('sửa lại số hợp lệ thì tự lưu và hết lỗi', async () => {
    const ops = await mkV('ops', 'A');
    ops.editShared('ops', { ...ops.current().ops, rmFte: 530 });
    ops.editShared('ops', { ...ops.current().ops, rmFte: 6 });
    await vi.advanceTimersByTimeAsync(600);
    expect(ops.getState().saves.ops.state).toBe('saved');
    expect(hub.read(TEAM).decisions.ops?.data).toMatchObject({ rmFte: 6 });
  });

  it('Firebase từ chối: báo phần nào, thay đổi gì, nguyên nhân dễ hiểu; không ghi nhật ký', async () => {
    const be = new MockBackend(hub, 'uid-A');
    be.writeDecision = async () => { throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); };
    const ops = await mkV('ops', 'A', be);
    ops.editShared('ops', { ...ops.current().ops, shifts: 3 });
    await vi.advanceTimersByTimeAsync(600);
    const st = ops.getState();
    expect(st.saves.ops.state).toBe('error');
    expect(st.saves.ops.message).toContain('Không lưu được phần Ops (thay đổi: số ca 2 → 3)');
    expect(st.saves.ops.message).toContain('Firebase từ chối quyền');
    expect(st.errors[0].detail).toContain('permission-denied');
    expect(hub.read(TEAM).log).toHaveLength(0);
  });

  it('thông báo trùng được gộp, có số lần', async () => {
    const ops = await mkV('ops', 'A');
    for (let i = 0; i < 4; i++) ops.editShared('ops', { ...ops.current().ops, rmFte: 530 });
    const errs = ops.getState().notices.filter((n) => n.kind === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].count).toBe(4);
  });

  it('"Bỏ thay đổi chưa lưu" quay về bản đã lưu', async () => {
    const ops = await mkV('ops', 'A');
    ops.editShared('ops', { ...ops.current().ops, rmFte: 7 });
    await vi.advanceTimersByTimeAsync(600);
    ops.editShared('ops', { ...ops.current().ops, rmFte: 530 });
    ops.revertDept('ops');
    expect(ops.current().ops.rmFte).toBe(7);
    expect(ops.getState().saves.ops.state).toBe('saved');
  });

  it('giới hạn Purchasing trong app khớp với firestore.rules', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    for (const [k, lim] of Object.entries(PUR_LIMITS)) expect(rules, k).toContain(`t.${k} >= ${lim.min} && t.${k} <= ${lim.max}`);
    expect(rules).toContain('t.paymentTermWeeks is int');
    for (const k of PUR_TEXT) expect(rules, k).toContain(`t.${k}.size() <= ${PUR_TEXT_MAX}`);
    for (const c of PUR_COMPONENTS) expect(rules, c).toContain(`validTerms(m['${c}'])`);
  });
  it('validateDept purchasing: chặn số ngoài giới hạn, nhận ô bỏ trống (null)', () => {
    const t = { transport: 'Truck', tradeUnit: 'Pallet', quality: 'High', deliveryWindow: '1 day', paymentTermWeeks: 4, agreedReliability: 0.95, ciGame: null, reliabilityActual: null, rejectionActual: null };
    expect(validateDept('purchasing', { suppliers: {}, terms: { PET: t } })).toEqual([]);
    expect(validateDept('purchasing', { suppliers: {}, terms: { PET: { ...t, ciGame: 1.02 } } })).toEqual([]);
    expect(validateDept('purchasing', { suppliers: {}, terms: { PET: { ...t, ciGame: 5 } } })[0].path).toBe('purchasing.terms.PET.ciGame');
    expect(validateDept('purchasing', { suppliers: {}, terms: { PET: { ...t, paymentTermWeeks: 4.5 } } })[0].message).toMatch(/số nguyên/);
    expect(validateDept('purchasing', { suppliers: {}, terms: { Sugar: t } })[0].message).toMatch(/nguyên liệu/);
  });
  it('giới hạn trong app khớp với firestore.rules', () => {
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    for (const [k, lim] of Object.entries(OPS_LIMITS)) {
      if (k === 'shifts') { expect(rules).toContain(`d.shifts >= ${lim.min} && d.shifts <= ${lim.max}`); continue; }
      expect(rules, k).toContain(`num(d.${k}, ${lim.min}, ${lim.max})`);
    }
  });
});
