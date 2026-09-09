export type BondAnalysisRequest = { faceValue: number; couponRate: number; maturityYears: number; paymentsPerYear: number; yield: number; shocksBasisPoints: number[] }
export type BondAnalysisResponse = {
  instrument: { type: string; faceValue: number; couponRate: number; maturityYears: number; paymentsPerYear: number; yield: number }
  metrics: { presentValue: number; macaulayDuration: number; modifiedDuration: number; dv01: number; convexity: number }
  cashflows: Array<{ timeYears: number; amount: number }>
  scenarios: RateScenario[]
}
export type RateScenario = { shockBasisPoints: number; shockedYield: number; originalPrice: number; shockedPrice: number; exactPnl: number; durationPnl: number; durationConvexityPnl: number }
