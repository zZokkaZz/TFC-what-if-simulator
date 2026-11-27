// Kiểu dữ liệu Round 1 (sinh từ data/TFC_Round1.xlsx bởi scripts/build-data-r1.ts). Mọi số chép từ file, không tính lại.
import type { ComponentKey, SkuKey } from './types';

export interface R1FinanceRow { label: string; r1: number; r0: number; level: number }

export interface Round1Data {
  meta: { source: string; generatedAt: string; sheets: string[] };
  finance: {
    rows: R1FinanceRow[];
    roi: number;
    realizedRevenue: number;
    contracted: Record<string, number>;
    /** Penalty (âm) hoặc thưởng (dương) service level theo khách, Finance R1 */
    penaltyBonus: Record<string, number>;
    operatingProfit: number;
    investment: number;
    paymentTerms: { r1: number; r0: number };
    stock: number;
  };
  decisions: {
    ops: { rmPalletLocations: number; rmFte: number; intakeDays: number; preventiveMaintenance: string; breakdownTraining: boolean; bottlingLine: string; shifts: number; smed: boolean; increaseSpeed: boolean; fgPalletLocations: number; fgFte: number; rmInspection: Record<string, boolean> };
    sc: { components: Record<ComponentKey, { safetyStockWeeks: number; lotSizeWeeks: number }>; frozenPeriodWeeks: number; products: Record<SkuKey, { productionIntervalDays: number; safetyStockWeeks: number }> };
    purchasing: Record<ComponentKey, { supplier: string; contractIndex: number; quality: string; leadTimeDays: number; certified: boolean; transport: string; freeCapacity: number; paymentTermWeeks: number; tradeUnit: string; agreedReliability: number; deliveryWindow: string }>;
    sales: { customers: Record<string, { contractIndex: number; serviceLevelType: string; serviceLevel: number; shelfLife: number; orderDeadline: string; tradeUnit: string; paymentTermWeeks: number; promotionalPressure: string; promotionHorizon: string }>; shortageRule: string; customerPriority: string[] };
  };
  line: { name: string; run: number; changeover: number; breakdown: number; unused: number; overtime: number; startupLossEur: number; planAdherence: number };
  mixer: { cleaningShare: number; avgLotL: number };
  warehouse: {
    rm: { capacity: number; usage: number; utilization: number; overflow: number; orderLinesPerWeek: number; palletsPerWeek: number; hoursPerWeek: number; flexFte: number };
    fg: { capacity: number; usage: number; utilization: number; overflow: number; orderLinesPerWeek: number; palletsPerWeek: number; hoursPerWeek: number; flexFte: number };
    tankDaysPerWeek: number;
    dailyHours: { rm: number[]; fg: number[] };
  };
  components: Record<ComponentKey, { reliability: number; stockUnits: number; stockWeeks: number; stockValue: number; demandPerWeek: number; availability: number; amountPurchased: number; orderSize: number }>;
  products: Record<SkuKey, { demandPerWeek: number; slPieces: number; slOrderLines: number; stockWeeks: number; stockValue: number; obsoletes: number; obsoleteValuePerWeek: number; batches: number; startupLossPerBatch: number; rejects: number; planAdherence: number }>;
  suppliers: Record<ComponentKey, { supplier: string; reliability: number; rejection: number; deliveries: number; purchaseValue: number; transportCosts: number; amountPurchased: number; pricePaid: number; orderSize: number }>;
  customers: Record<string, { attainedContractIndex: number; slPieces: number; slOrderLines: number; slOrders: number; revenue: number; palletsPerWeek: number; distributionCost: number }>;
  /** KPI dashboard Round 1 (giá trị % đã chia 100) */
  kpi: Record<string, number>;
}
