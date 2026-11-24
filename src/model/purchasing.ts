// Purchasing — M1: lấy điều kiện NCC đang chọn (mặc định = hợp đồng R0) cho Ops/SC dùng.
// M3 sẽ mô hình giá, reliability, lead time, chất lượng khi đổi NCC.
import type { ComponentKey, Round0Data, SupplierTerms } from '../data/types';
import type { Inputs } from './types';

export const COMPONENTS: ComponentKey[] = ['Pack', 'PET', 'Orange', 'Mango', 'Vitamin C'];

export interface ActiveSupplier extends SupplierTerms {
  rejection: number;
  rejectionBasis: 'r0' | 'estimate';
}

/** Tỷ lệ loại khi chọn NCC chưa có số R0 — ƯỚC LƯỢNG theo quality (M3 sẽ thay). */
const REJECTION_BY_QUALITY: Record<string, number> = { High: 0.01, Middle: 0.03, Poor: 0.06 };

export function activeSupplier(inputs: Inputs, data: Round0Data, c: ComponentKey): ActiveSupplier {
  const name = inputs.purchasing.suppliers[c];
  const terms =
    data.purchasing.market.find((s) => s.component === c && s.supplier === name) ??
    data.purchasing.contracts.find((s) => s.component === c);
  if (!terms) throw new Error(`Không có NCC cho ${c}`);
  const r0 = data.purchasing.results.find((r) => r.supplier === terms.supplier && r.component === c);
  return r0
    ? { ...terms, rejection: r0.rejection, rejectionBasis: 'r0' }
    : { ...terms, rejection: REJECTION_BY_QUALITY[terms.quality] ?? 0.03, rejectionBasis: 'estimate' };
}
