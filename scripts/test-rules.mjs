// Kiểm thử firestore.rules bằng Firestore Emulator (không đụng project thật).
// Cần: Java 11+, rồi:
//   npm i -D firebase-tools @firebase/rules-unit-testing
//   npx firebase emulators:exec --only firestore --project demo-tfc "node scripts/test-rules.mjs"
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, updateDoc, collection, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

const rulesPath = process.env.RULES ?? new URL('../firestore.rules', import.meta.url).pathname;
const env = await initializeTestEnvironment({ projectId: 'demo-tfc', firestore: { rules: readFileSync(rulesPath, 'utf8') } });
const TEAM = 'team-abc-12345';
const alice = env.authenticatedContext('alice').firestore();
const bob = env.authenticatedContext('bob').firestore();
const anon = env.unauthenticatedContext().firestore();

const ops = {
  rmInspection: { Pack: false, PET: true, Orange: false, Mango: false, 'Vitamin C': false },
  rmPalletLocations: 900, rmFte: 5, intakeDays: 5, mixer: 'Fruitmix MQ', preventiveMaintenance: 'None',
  breakdownTraining: false, bottlingLine: 'Swiss Fill 2', shifts: 2, smed: false, increaseSpeed: false, fgPalletLocations: 1500, fgFte: 4,
};
const decision = (uid, role, data, extra = {}) => ({ data, uid, role, clientId: 'c1', rev: 1, updatedAt: serverTimestamp(), ...extra });
let pass = 0, fail = 0;
const t = async (name, p) => { try { await p; pass++; console.log('✔', name); } catch (e) { fail++; console.log('✖', name, '—', e.message); } };

await t('ghi decisions/ops hợp lệ', assertSucceeds(setDoc(doc(alice, 'teams', TEAM, 'decisions', 'ops'), decision('alice', 'ops', ops))));
await t('đọc decisions (đã đăng nhập)', assertSucceeds(getDocs(collection(bob, 'teams', TEAM, 'decisions'))));
await t('chưa đăng nhập: không đọc được', assertFails(getDoc(doc(anon, 'teams', TEAM, 'decisions', 'ops'))));
await t('không liệt kê được danh sách teams', assertFails(getDocs(collection(alice, 'teams'))));
await t('không đọc document gốc của team', assertFails(getDoc(doc(alice, 'teams', TEAM))));
await t('mã đội quá ngắn bị chặn', assertFails(setDoc(doc(alice, 'teams', 'abc', 'decisions', 'ops'), decision('alice', 'ops', ops))));
await t('uid giả mạo bị chặn', assertFails(setDoc(doc(alice, 'teams', TEAM, 'decisions', 'ops'), decision('bob', 'ops', ops))));
await t('role khác phòng bị chặn', assertFails(setDoc(doc(alice, 'teams', TEAM, 'decisions', 'ops'), decision('alice', 'sc', ops))));
await t('trường lạ trong ops bị chặn', assertFails(setDoc(doc(alice, 'teams', TEAM, 'decisions', 'ops'), decision('alice', 'ops', { ...ops, hack: 1 }))));
await t('sai kiểu (shifts là chuỗi) bị chặn', assertFails(setDoc(doc(alice, 'teams', TEAM, 'decisions', 'ops'), decision('alice', 'ops', { ...ops, shifts: '3' }))));
await t('shifts = 7 bị chặn', assertFails(setDoc(doc(alice, 'teams', TEAM, 'decisions', 'ops'), decision('alice', 'ops', { ...ops, shifts: 7 }))));
await t('phòng không tồn tại bị chặn', assertFails(setDoc(doc(alice, 'teams', TEAM, 'decisions', 'hr'), decision('alice', 'hr', {}))));
await t('ghi decisions/sc hợp lệ', assertSucceeds(setDoc(doc(bob, 'teams', TEAM, 'decisions', 'sc'), decision('bob', 'sc', { components: { PET: { safetyStockWeeks: 2, lotSizeWeeks: 4 } }, products: {}, frozenPeriodWeeks: 3 }))));
await t('ghi decisions/purchasing hợp lệ', assertSucceeds(setDoc(doc(bob, 'teams', TEAM, 'decisions', 'purchasing'), decision('bob', 'purchasing', { suppliers: { PET: 'Plantin PET' } }))));
await t('ghi decisions/sales hợp lệ (rỗng)', assertSucceeds(setDoc(doc(bob, 'teams', TEAM, 'decisions', 'sales'), decision('bob', 'sales', {}))));
await t('không xóa được decisions', assertFails(deleteDoc(doc(alice, 'teams', TEAM, 'decisions', 'ops'))));
const log = { uid: 'alice', role: 'ops', dept: 'ops', summary: 'Ops đổi số ca 2 → 3', changes: [{ path: 'ops.shifts', label: 'số ca', from: '2', to: '3' }], at: serverTimestamp() };
let logRef;
await t('thêm nhật ký', assertSucceeds(addDoc(collection(alice, 'teams', TEAM, 'log'), log).then((r) => { logRef = r; })));
await t('đọc 50 dòng nhật ký', assertSucceeds(getDocs(query(collection(bob, 'teams', TEAM, 'log'), orderBy('at', 'desc'), limit(50)))));
await t('đọc nhật ký không giới hạn bị chặn', assertFails(getDocs(collection(bob, 'teams', TEAM, 'log'))));
await t('không xóa được nhật ký', assertFails(deleteDoc(doc(alice, 'teams', TEAM, 'log', logRef?.id ?? 'x'))));
await t('không sửa được nhật ký', assertFails(updateDoc(doc(alice, 'teams', TEAM, 'log', logRef?.id ?? 'x'), { summary: 'sửa' })));
await t('nhật ký tóm tắt quá dài bị chặn', assertFails(addDoc(collection(alice, 'teams', TEAM, 'log'), { ...log, summary: 'x'.repeat(301) })));
let snapRef;
const inputs = { ops, sc: { components: {}, products: {}, frozenPeriodWeeks: 3 }, purchasing: { suppliers: {} }, sales: {} };
await t('chụp snapshot', assertSucceeds(addDoc(collection(alice, 'teams', TEAM, 'snapshots'), { name: 'R1 – phương án 1', uid: 'alice', role: 'ops', inputs, at: serverTimestamp() }).then((r) => { snapRef = r; })));
await t('đọc 30 snapshot', assertSucceeds(getDocs(query(collection(bob, 'teams', TEAM, 'snapshots'), orderBy('at', 'desc'), limit(30)))));
await t('không sửa snapshot', assertFails(updateDoc(doc(bob, 'teams', TEAM, 'snapshots', snapRef?.id ?? 'x'), { name: 'khác' })));
await t('xóa snapshot', assertSucceeds(deleteDoc(doc(bob, 'teams', TEAM, 'snapshots', snapRef?.id ?? 'x'))));
await t('đường dẫn khác bị chặn', assertFails(setDoc(doc(alice, 'other', 'x'), { a: 1 })));

await env.cleanup();
console.log(`\n${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
