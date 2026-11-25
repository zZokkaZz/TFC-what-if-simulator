// Kiểm thử THẬT với Firebase: 2 phiên ẩn danh (Ops, SC) cùng một mã đội thử nghiệm.
// Chạy: TEAM=<mã-thử> npx tsx scripts/firebase-smoke.ts   (mặc định: smoke-test-<ngẫu nhiên>)
// Với emulator: EMU=1 (Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099)
import data from '../src/data/round0.json';
import type { Round0Data } from '../src/data/types';
import { baselineInputs } from '../src/model/simulate';
import { SyncController } from '../src/sync/controller';
import { FirebaseBackend } from '../src/sync/firebaseBackend';
import { makeSanitizer } from '../src/sync/sanitize';

const d = data as unknown as Round0Data;
const base = baselineInputs(d);
const team = process.env.TEAM ?? `smoke-test-${Math.random().toString(36).slice(2, 10)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 15000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await sleep(200); } return true; };

const emu = process.env.EMU ? { firestoreHost: '127.0.0.1', firestorePort: 8080, authUrl: 'http://127.0.0.1:9099' } : undefined;
const mk = (role: 'ops' | 'sc', id: string) => new SyncController(new FirebaseBackend(id, emu), base, { team, role, clientId: id, sanitize: makeSanitizer(base) });
const a = mk('ops', 'smokeA'), b = mk('sc', 'smokeB');
console.log('team:', team);
await Promise.all([a.start(), b.start()]);
console.log('uid A', a.getState().uid, '· uid B', b.getState().uid, '· status', a.getState().status, a.getState().error ?? '');
await until(() => a.getState().ready && b.getState().ready);
const target = (b.current().ops.shifts % 5) + 1;
const t0 = Date.now();
a.editShared('ops', { ...a.current().ops, shifts: target });
const ok = await until(() => b.current().ops.shifts === target);
console.log(ok ? `✔ B thấy Ops đổi số ca → ${target} sau ${Date.now() - t0} ms` : `✖ B không nhận được thay đổi. Lỗi: ${b.getState().error ?? a.getState().error ?? a.getState().notices.map((n) => n.text).join(' | ')}`);
await until(() => b.getState().log.length > 0, 5000);
console.log('nhật ký B:', b.getState().log[0]?.summary ?? '(trống)');
console.log('trạng thái A/B:', a.getState().status, '/', b.getState().status);
a.stop(); b.stop();
process.exit(ok ? 0 : 1);
