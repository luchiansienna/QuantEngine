export type RiskInput = {
  spot: number; rate: number; dividendYield: number; volatility: number;
  maturity: number; confidence: number; physicalDrift: number; horizonDays: number;
  collateral: number; hazardRate: number; recovery: number; paths: number; steps: number;
  seed: number; trades: { quantity: number; strike: number }[];
}
export type RiskResult = {
  cleanValue: number; cva: number; adjustedValue: number; peakPfe: number;
  var: number; expectedShortfall: number; paths: number; seed: number;
  confidence: number; horizonDays: number; modelVersion: string;
  profile: { time: number; expectedExposure: number; pfe: number }[];
}
export type CreditInput = { face: number; coupon: number; maturity: number; frequency: number; rate: number; hazardRate: number; recovery: number }
export type CreditResult = { riskFreePrice: number; riskyPrice: number; creditAdjustment: number; defaultProbability: number }
export type HistoricalResult = { var: number; expectedShortfall: number; observations: number }
export type ExposureRow = { tradeId: string; counterparty: string; nettingSet: string; asOf: string;
  currency: string; metric: 'EE' | 'PFE'; tenor: number; confidence: number;
  modelVersion: string; scenarioId: string; value: number }
export type ReconRow = { key: Pick<ExposureRow, 'tradeId' | 'counterparty' | 'nettingSet' | 'metric' | 'tenor'>;
  status: string; reasons: string[]; engineRows: ExposureRow[]; reportingRows: ExposureRow[];
  difference: number | null; allowedDifference: number | null }
export type ReconResult = { reconciledAt: string; engineCount: number; reportingCount: number;
  matched: number; breaks: number; absoluteTolerance: number; relativeTolerance: number; rows: ReconRow[] }
