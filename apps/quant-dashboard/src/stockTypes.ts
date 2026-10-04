export type StockAlgorithm = { id: string; name: string; assetClass: string }
export type StockQuery = { symbol: string; primaryExchange: string; years: number }
export type StockBar = { date: string; open: number; close: number }
export type StockHistory = {
  datasetId: string; symbol: string; primaryExchange: string; contractId: number
  currency: string; fetchedAt: string; source: string; priceBasis: string; bars: StockBar[]
}
export type StockSettings = {
  algorithm: string; fastWindow: number; slowWindow: number; initialCash: number
  allocation: number; feeBps: number; slippageBps: number
}
export type StockTrade = { signalDate: string; executionDate: string; side: 'Buy' | 'Sell'; shares: number; price: number; fee: number }
export type StockEquity = { date: string; cash: number; shares: number; equity: number; benchmarkEquity: number }
export type StockResult = {
  strategy: string; fastWindow: number; slowWindow: number; initialCash: number; allocation: number
  feeBps: number; slippageBps: number; finalEquity: number; totalReturn: number
  benchmarkReturn: number; maxDrawdown: number; totalFees: number; trades: StockTrade[]; equity: StockEquity[]
}
export type StockResponse = { datasetId: string; symbol: string; currency: string; fetchedAt: string; result: StockResult }
export function movingAverage(bars: StockBar[], window: number): (number | null)[] {
  let sum = 0
  return bars.map((bar, i) => {
    sum += bar.close
    if (i >= window) sum -= bars[i - window].close
    return i + 1 >= window ? sum / window : null
  })
}
export function drawdowns(equity: StockEquity[], initial: number): number[] {
  let peak = initial
  return equity.map(e => { peak = Math.max(peak, e.equity); return -100 * (peak - e.equity) / peak })
}
