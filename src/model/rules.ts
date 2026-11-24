// Luật & định mức ĐÃ BIẾT từ Info Center (CLAUDE.md mục 6, tab 5_Operations "ĐỊNH MỨC").
// tests/rules.test.ts đối chiếu các số này với chuỗi định mức trong file Excel.

export const ROUND = { weeks: 26, days: 130, daysPerWeek: 5, annualToRound: 0.5 } as const;

export const WAREHOUSE = {
  palletLocationPerYear: 200, // €/chỗ/năm
  overflowPerPalletDay: 3, // €/pallet/ngày
  ftePerYear: 40_000, // €/FTE/năm
  fteHoursPerWeek: 40,
  flexPerHour: 42, // €/giờ thời vụ
} as const;

export const RM_NORMS = {
  receiveHoursPerLine: 1, // 1 giờ/dòng đơn
  receiveHoursPerPallet: 6 / 60, // 6 phút/pallet
  issueHoursPerPallet: 6 / 60,
  issueHoursPerTank: 12 / 60,
  fixedHoursPerDay: 4,
  overflowMoveHoursPerPallet: 6 / 60,
  ibcPourHours: 1, // đổ IBC khi tank yard thiếu chỗ (chưa dùng: tank yard ngoài, không giới hạn)
  inspectionHoursPerLine: 2,
} as const;

export const TANK_YARD = { perTankDay: 25, perReceipt: 10, perDelivery: 100 } as const;

export const FG_NORMS = {
  inboundHoursPerPallet: 6 / 60,
  pickHoursPerLine: 10 / 60,
  pickHoursPerPalletOrLayer: 6 / 60,
  pickHoursPerCase: 3 / 60,
  overflowOrScrapHoursPerPallet: 6 / 60,
  fixedHoursPerDay: 4,
  distributionPerPallet: 31,
} as const;

export const BOTTLING = {
  shiftHours: { 1: 40, 2: 80, 3: 120, 4: 144, 5: 168 } as Record<number, number>,
  maxHoursPerWeek: 168,
  outsourcingCostMultiplier: 2,
  smedAnnual: 20_000,
  smedChangeoverReduction: 0.3,
  speedAnnual: 30_000,
  speedIncrease: 0.1,
  pm: {
    None: { hoursPerWeek: 0, breakdownReduction: 0 },
    Minimal: { hoursPerWeek: 1, breakdownReduction: 0.3 },
    Extensive: { hoursPerWeek: 3, breakdownReduction: 0.5 },
  },
  trainingPerPerson: 400,
  trainingRepairReduction: 0.4,
  startupLossHours: 1, // "giờ đầu tiên" sau mỗi changeover
} as const;
