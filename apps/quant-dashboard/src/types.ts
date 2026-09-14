export type CurvePoint = { maturityYears: number; rate: number }
export type BondAnalysisRequest = { faceValue: number; couponRate: number; maturityYears: number; paymentsPerYear: number; yield: number; shocksBasisPoints: number[]; curvePoints?: CurvePoint[] }
export type BondAnalysisResponse = {
  valuationMode?: "flat" | "curve"
  curvePoints?: CurvePoint[]
  instrument: { type: string; faceValue: number; couponRate: number; maturityYears: number; paymentsPerYear: number; yield: number }
  metrics: { presentValue: number; macaulayDuration: number; modifiedDuration: number; dv01: number; convexity: number }
  cashflows: Array<{ timeYears: number; amount: number; zeroRate: number; discountFactor: number; presentValue: number }>
  scenarios: RateScenario[]
}
export type RateScenario = { shockBasisPoints: number; shockedYield: number; originalPrice: number; shockedPrice: number; exactPnl: number; durationPnl: number; durationConvexityPnl: number }
