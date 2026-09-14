export type CurvePoint = {
  maturityYears: number
  rate: number
}

export type BondAnalysisRequest = {
  faceValue: number
  couponRate: number
  maturityYears: number
  paymentsPerYear: number
  yield: number
  shocksBasisPoints: number[]
  curvePoints?: CurvePoint[]
}

export type BondAnalysisResponse = {
  valuationMode?: 'flat' | 'curve'
  curvePoints?: CurvePoint[]

  instrument: {
    type: string
    faceValue: number
    couponRate: number
    maturityYears: number
    paymentsPerYear: number
    yield: number
  }

  metrics: {
    presentValue: number
    macaulayDuration: number
    modifiedDuration: number
    dv01: number
    convexity: number
  }

  cashflows: Array<{
    timeYears: number
    amount: number
    zeroRate: number
    discountFactor: number
    presentValue: number
  }>

  scenarios: RateScenario[]
}

export type RateScenario = {
  shockBasisPoints: number
  shockedYield: number
  originalPrice: number
  shockedPrice: number
  exactPnl: number
  durationPnl: number
  durationConvexityPnl: number
}

export type OptionAnalysisRequest = {
  optionType: 'Call' | 'Put'
  spot: number
  strike: number
  riskFreeRate: number
  dividendYield: number
  volatility: number
  timeToExpiry: number
  marketPrice: number
}

export type OptionAnalysisResponse = {
  instrument: OptionAnalysisRequest & {
    type: string
  }

  metrics: {
    modelPrice: number
    intrinsicValue: number
    impliedVolatility: number
    delta: number
    gamma: number
    vegaPerPercentagePoint: number
    thetaPerDay: number
    rhoPerPercentagePoint: number
  }

  spotScenarios: Array<{
    spot: number
    modelPrice: number
    payoffAtExpiry: number
  }>

  volatilityScenarios: Array<{
    volatility: number
    modelPrice: number
    pnl: number
  }>
}