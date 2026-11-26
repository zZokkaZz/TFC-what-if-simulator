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
const terms = { transport: 'Truck', tradeUnit: 'Pallet', quality: 'High', deliveryWindow: '1 day', paymentTermWeeks: 4, agreedReliability: 0.95, ciGame: null, reliabilityActual: null, rejectionActual: null };
const pur = (t) => decision('bob', 'purchasing', { suppliers: { PET: 'Plantin PET' }, terms: { PET: t } });
const purRef = doc(bob, 'teams', TEAM, 'decisions', 'purchasing');
await t('purchasing: điều kiện hợp đồng hợp lệ (ô số game bỏ trống)', assertSucceeds(setDoc(purRef, pur(terms))));
await t('purchasing: nhập CI game / reliability / rejection hợp lệ', assertSucceeds(setDoc(purRef, pur({ ...terms, ciGame: 1.012, reliabilityActual: 0.9, rejectionActual: 0.02 }))));
await t('purchasing: đủ 5 nguyên liệu (có "Vitamin C")', assertSucceeds(setDoc(purRef, decision('bob', 'purchasing', { suppliers: {}, terms: { Pack: terms, PET: terms, Orange: terms, Mango: terms, 'Vitamin C': terms } }))));
const full = { ...terms, ciGame: 1.0518, reliabilityActual: 0.88, rejectionActual: 0.012 };
await t('purchasing: 5 nguyên liệu, điền đủ CI/reliability/rejection (ca tốn biểu thức nhất) hợp lệ', assertSucceeds(setDoc(purRef, decision('bob', 'purchasing', { suppliers: { Pack: 'Brit Pack', PET: 'Plantin PET', Orange: "Arancia d'Espana", Mango: 'Dalima Mango', 'Vitamin C': 'SYI' }, terms: { Pack: full, PET: full, Orange: full, Mango: full, 'Vitamin C': full } }))));
await t('purchasing: payment term 60 tuần bị chặn', assertFails(setDoc(purRef, pur({ ...terms, paymentTermWeeks: 60 }))));
await t('purchasing: payment term lẻ bị chặn', assertFails(setDoc(purRef, pur({ ...terms, paymentTermWeeks: 4.5 }))));
await t('purchasing: reliability cam kết 0,3 bị chặn', assertFails(setDoc(purRef, pur({ ...terms, agreedReliability: 0.3 }))));
await t('purchasing: CI game 5 bị chặn', assertFails(setDoc(purRef, pur({ ...terms, ciGame: 5 }))));
await t('purchasing: rejection 0,9 bị chặn', assertFails(setDoc(purRef, pur({ ...terms, rejectionActual: 0.9 }))));
await t('purchasing: CI game là chuỗi bị chặn', assertFails(setDoc(purRef, pur({ ...terms, ciGame: '1.0' }))));
await t('purchasing: trường lạ trong điều kiện bị chặn', assertFails(setDoc(purRef, pur({ ...terms, price: 1 }))));
await t('purchasing: nguyên liệu lạ bị chặn', assertFails(setDoc(purRef, decision('bob', 'purchasing', { suppliers: {}, terms: { Sugar: terms } }))));
await t('purchasing: trade unit quá dài bị chặn', assertFails(setDoc(purRef, pur({ ...terms, tradeUnit: 'x'.repeat(21) }))));
await t('ghi decisions/sales hợp lệ (rỗng)', assertSucceeds(setDoc(doc(bob, 'teams', TEAM, 'decisions', 'sales'), decision('bob', 'sales', {}))));
const salesRef = doc(bob, 'teams', TEAM, 'decisions', 'sales');
const cust = { tradeUnit: 'Pallet layer', orderDeadline: '20.00', ciGame: null };
const sal = (customers) => decision('bob', 'sales', { customers });
await t('sales: điều khoản 1 khách hợp lệ (CI game trống)', assertSucceeds(setDoc(salesRef, sal({ 'LAND Market': cust }))));
await t('sales: đủ 3 khách, điền CI game (có "Dominick\'s", "Food & Groceries") hợp lệ', assertSucceeds(setDoc(salesRef, sal({ 'Food & Groceries': { ...cust, tradeUnit: 'Box (outer box)', ciGame: 1.02 }, 'LAND Market': { ...cust, ciGame: 0.97 }, "Dominick's": { tradeUnit: 'Pallet', orderDeadline: '12.00', ciGame: 1.0166 } }))));
await t('sales: CI game 5 bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...cust, ciGame: 5 } }))));
await t('sales: CI game là chuỗi bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...cust, ciGame: '1.0' } }))));
await t('sales: trade unit quá dài bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...cust, tradeUnit: 'x'.repeat(21) } }))));
await t('sales: trade unit là số bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...cust, tradeUnit: 3 } }))));
await t('sales: trường lạ trong điều khoản bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...cust, price: 1 } }))));
await t('sales: khách lạ bị chặn', assertFails(setDoc(salesRef, sal({ Hacker: cust }))));
await t('sales: khóa lạ ở gốc (dạng phẳng cũ) bị chặn', assertFails(setDoc(salesRef, decision('bob', 'sales', { shelfLife: 0.7 }))));
const full9 = { tradeUnit: 'Pallet layer', orderDeadline: '20.00', ciGame: null, serviceLevelType: 'Order lines', serviceLevel: 0.95, shelfLife: 0.75, paymentTermWeeks: 4, promotionalPressure: 'Middle', promotionHorizon: 'Short' };
await t('sales: đủ 9 trường × 3 khách, điền CI game (ca tốn biểu thức nhất) hợp lệ', assertSucceeds(setDoc(salesRef, sal({ 'Food & Groceries': { ...full9, ciGame: 1.01, serviceLevelType: 'Orders' }, 'LAND Market': { ...full9, ciGame: 0.97 }, "Dominick's": { ...full9, ciGame: 1.0166, tradeUnit: 'Pallet', orderDeadline: '12.00' } }))));
await t('sales: SL hứa 0,7 bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, serviceLevel: 0.7 } }))));
await t('sales: SL hứa 1,2 bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, serviceLevel: 1.2 } }))));
await t('sales: shelf life 0,9 bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, shelfLife: 0.9 } }))));
await t('sales: shelf life 0,3 bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, shelfLife: 0.3 } }))));
await t('sales: payment term 9 bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, paymentTermWeeks: 9 } }))));
await t('sales: payment term 0 bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, paymentTermWeeks: 0 } }))));
await t('sales: payment term lẻ (4,5) bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, paymentTermWeeks: 4.5 } }))));
await t('sales: promotion quá dài bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, promotionalPressure: 'x'.repeat(21) } }))));
await t('sales: SL hứa là chuỗi bị chặn', assertFails(setDoc(salesRef, sal({ 'LAND Market': { ...full9, serviceLevel: '95' } }))));
await t('sales: shortage rule + thứ tự ưu tiên khách hợp lệ', assertSucceeds(setDoc(salesRef, decision('bob', 'sales', { customers: { 'LAND Market': full9 }, shortageRule: 'First come, first served', customerPriority: ['Food & Groceries', "Dominick's", 'LAND Market'] }))));
await t('sales: shortage rule quá dài bị chặn', assertFails(setDoc(salesRef, decision('bob', 'sales', { customers: {}, shortageRule: 'x'.repeat(31) }))));
await t('sales: thứ tự ưu tiên có khách lạ bị chặn', assertFails(setDoc(salesRef, decision('bob', 'sales', { customers: {}, customerPriority: ['Hacker'] }))));
await t('sales: thứ tự ưu tiên không phải danh sách bị chặn', assertFails(setDoc(salesRef, decision('bob', 'sales', { customers: {}, customerPriority: 'Food & Groceries' }))));
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
