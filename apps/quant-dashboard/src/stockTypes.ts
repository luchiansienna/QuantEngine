export type StrategyParameter = { key: string; label: string; default: number; min: number; max: number; step: number }
export type StockAlgorithm = { id: string; name: string; assetClass: string; description: string; parameters: StrategyParameter[] }
export type StockQuery = { symbol: string; primaryExchange: string; years: number }
export type StockBar = { date: string; open: number; close: number }
export type StockHistory = {
  datasetId: string; symbol: string; primaryExchange: string; contractId: number
  currency: string; fetchedAt: string; source: string; priceBasis: string; bars: StockBar[]
}
export type StockSettings = {
  algorithm: string; parameters: Record<string, number>; initialCash: number
  allocation: number; feeBps: number; slippageBps: number
}
export type StockTrade = { signalDate: string; executionDate: string; side: 'Buy' | 'Sell'; shares: number; price: number; fee: number }
export type StockEquity = { date: string; cash: number; shares: number; equity: number; benchmarkEquity: number }
export type StockResult = {
  warmupBars: number
  strategy: string; parameters: Record<string, number>; initialCash: number; allocation: number
  feeBps: number; slippageBps: number; finalEquity: number; totalReturn: number
  benchmarkReturn: number; maxDrawdown: number; totalFees: number; trades: StockTrade[]; equity: StockEquity[]
}
export type StockResponse = { datasetId: string; symbol: string; currency: string; fetchedAt: string; result: StockResult }
export type Series = { name: string; color: string; values: (number | null)[] }

// TypeScript types do not validate JSON. Reject stale catalogs before rendering.
export function readAlgorithmCatalog(value: unknown): StockAlgorithm[] {
  if (!Array.isArray(value) || !value.length) throw new Error('The strategy catalog is empty or invalid.')
  const ids = new Set<string>()
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.name !== 'string' || typeof item.assetClass !== 'string' ||
        typeof item.description !== 'string' || !Array.isArray(item.parameters) || !item.parameters.length) {
      throw new Error('The strategy API returned an incompatible catalog. Rebuild and restart QuantWebApi, then retry.')
    }
    ids.add(item.id)
    const keys = new Set<string>()
    for (const p of item.parameters) {
      if (!p || typeof p.key !== 'string' || !p.key || keys.has(p.key) || typeof p.label !== 'string' ||
          ![p.default, p.min, p.max, p.step].every(n => typeof n === 'number' && Number.isFinite(n)) ||
          p.step <= 0 || p.min > p.max || p.default < p.min || p.default > p.max) {
        throw new Error('The strategy API returned invalid parameter definitions.')
      }
      keys.add(p.key)
    }
  }
  return value as StockAlgorithm[]
}

export function movingAverage(bars: StockBar[], window: number): (number | null)[] {
  let sum = 0
  return bars.map((bar, i) => {
    sum += bar.close
    if (i >= window) sum -= bars[i - window].close
    return i + 1 >= window ? sum / window : null
  })
}

// Wilder RSI, seeded with a simple average of the first `period` changes (matches the C++ engine).
export function rsi(bars: StockBar[], period: number): (number | null)[] {
  const out: (number | null)[] = bars.map(() => null)
  let sumGain = 0, sumLoss = 0, avgGain = 0, avgLoss = 0
  for (let i = 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close
    const gain = Math.max(change, 0), loss = Math.max(-change, 0)
    if (i < period) { sumGain += gain; sumLoss += loss; continue }
    if (i === period) { avgGain = (sumGain + gain) / period; avgLoss = (sumLoss + loss) / period }
    else { avgGain = (avgGain * (period - 1) + gain) / period; avgLoss = (avgLoss * (period - 1) + loss) / period }
    out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

// Indicator lines drawn over the price chart. Keep in step with the engine's strategies.
export function priceOverlays(strategy: string, p: Record<string, number>, bars: StockBar[]): Series[] {
  switch (strategy) {
    case 'sma-long-cash': return [
      { name: `Fast ${p.fastWindow}`, color: '#c7ff58', values: movingAverage(bars, p.fastWindow) },
      { name: `Slow ${p.slowWindow}`, color: '#67d7ff', values: movingAverage(bars, p.slowWindow) },
    ]
    case 'momentum-long-cash': return [
      { name: `Close ${p.lookback} sessions ago`, color: '#c7ff58', values: bars.map((_, i) => i >= p.lookback ? bars[i - p.lookback].close : null) },
    ]
    case 'rsi-mean-reversion': return [
      { name: `Trend SMA ${p.trendWindow}`, color: '#67d7ff', values: movingAverage(bars, p.trendWindow) },
    ]
    default: return []
  }
}

export function drawdowns(equity: StockEquity[], initial: number): number[] {
  let peak = initial
  return equity.map(e => { peak = Math.max(peak, e.equity); return -100 * (peak - e.equity) / peak })
}

function maxDrawdown(values: number[], initial: number): number {
  let peak = initial, worst = 0
  for (const v of values) { peak = Math.max(peak, v); worst = Math.max(worst, (peak - v) / peak) }
  return worst
}
function sharpe(values: number[]): number | null {
  const r = values.slice(1).map((v, i) => v / values[i] - 1)
  if (r.length < 2) return null
  const mean = r.reduce((a, b) => a + b, 0) / r.length
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1)
  return variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(252) : null
}
function cagr(values: number[], firstDate: string, lastDate: string): number | null {
  const years = (Date.parse(lastDate) - Date.parse(firstDate)) / (365.25 * 86_400_000)
  const first = values[0], last = values[values.length - 1]
  return years > 0 && first > 0 && last > 0 ? (last / first) ** (1 / years) - 1 : null
}

export type RunStats = {
  sharpe: number | null; benchmarkSharpe: number | null
  cagr: number | null; benchmarkCagr: number | null
  benchmarkMaxDrawdown: number; exposure: number; closedTrades: number; wins: number
}
// Use the engine's eligible execution index, even if the benchmark price stays flat.
// Include the prior close for return calculations; exposure counts eligible sessions only.
export function runStats(equity: StockEquity[], trades: StockTrade[], initial: number, warmupBars?: number): RunStats {
  if (!equity.length) return { sharpe: null, benchmarkSharpe: null, cagr: null, benchmarkCagr: null,
    benchmarkMaxDrawdown: 0, exposure: 0, closedTrades: 0, wins: 0 }
  const firstMove = equity.findIndex(e => e.benchmarkEquity !== initial)
  const start = warmupBars ?? Math.max(0, firstMove)
  const live = equity.slice(Math.max(0, start - 1))
  const eligible = equity.slice(start)
  const strategy = live.map(e => e.equity), benchmark = live.map(e => e.benchmarkEquity)
  const firstDate = live[0].date, lastDate = live[live.length - 1].date
  let cost = 0, closedTrades = 0, wins = 0
  for (const t of trades) {
    if (t.side === 'Buy') cost = t.shares * t.price + t.fee
    else { closedTrades++; if (t.shares * t.price - t.fee > cost) wins++ }
  }
  return {
    sharpe: sharpe(strategy), benchmarkSharpe: sharpe(benchmark),
    cagr: cagr(strategy, firstDate, lastDate), benchmarkCagr: cagr(benchmark, firstDate, lastDate),
    benchmarkMaxDrawdown: maxDrawdown(equity.map(e => e.benchmarkEquity), initial),
    exposure: eligible.length ? eligible.filter(e => e.shares > 0).length / eligible.length : 0,
    closedTrades, wins,
  }
}
