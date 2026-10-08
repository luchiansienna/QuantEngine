export type AssetSeries = { name: string; currency: string; basis: string; points: { date: string; value: number }[] }
export type PortfolioPoint = { weights: number[]; mean: number; volatility: number; sharpe: number | null }
export type PortfolioModel = { assets: AssetSeries[]; dates: string[]; means: number[]; covariance: number[][]; frontier: PortfolioPoint[]; minimum: PortfolioPoint; equal: PortfolioPoint; best: PortfolioPoint }

export function readAsset(value: unknown, mode: 'prices' | 'strategy'): AssetSeries {
  const root = value as { symbol?: string; currency?: string; history?: { symbol?: string; currency?: string; priceBasis?: string; bars?: { date: string; close: number }[] }; result?: { equity?: { date: string; equity: number }[] }; bars?: { date: string; close: number }[]; priceBasis?: string }
  if (!root || typeof root !== 'object') throw new Error('Invalid history or backtest JSON.')
  const history = root.history ?? root
  const raw = mode === 'strategy' ? root.result?.equity : history.bars
  const name = root.symbol ?? history.symbol, currency = root.currency ?? history.currency
  if (!name || !currency || !Array.isArray(raw)) throw new Error('Import a stock history or exported backtest with symbol, currency and daily data.')
  const points = raw.map(p => ({ date: p.date, value: 'equity' in p ? p.equity : p.close }))
  return { name, currency, basis: mode === 'strategy' ? 'Strategy equity, after simulated costs' : history.priceBasis ?? 'Prices; dividend treatment unspecified', points }
}

export function portfolioPoint(weights: number[], means: number[], covariance: number[][], riskFree: number): PortfolioPoint {
  const mean = weights.reduce((s, w, i) => s + w * means[i], 0)
  const variance = weights.reduce((s, w, i) => s + w * weights.reduce((t, v, j) => t + v * covariance[i][j], 0), 0)
  const volatility = Math.sqrt(Math.max(0, variance))
  return { weights, mean, volatility, sharpe: volatility > 1e-10 ? (mean - riskFree) / volatility : null }
}

// Partial-pivot Gaussian elimination for the small equality-constrained systems.
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const a = matrix.map((row, i) => [...row, rhs[i]]), n = rhs.length
  for (let k = 0; k < n; k++) {
    let pivot = k
    for (let i = k + 1; i < n; i++) if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i
    if (Math.abs(a[pivot][k]) < 1e-13) return null
    ;[a[k], a[pivot]] = [a[pivot], a[k]]
    const divisor = a[k][k]
    for (let j = k; j <= n; j++) a[k][j] /= divisor
    for (let i = 0; i < n; i++) if (i !== k) {
      const factor = a[i][k]
      for (let j = k; j <= n; j++) a[i][j] -= factor * a[k][j]
    }
  }
  return a.map(row => row[n])
}

// Enumerate active sets: each feasible support solves a convex quadratic problem.
// Eight assets keep this deterministic search small (255 supports).
export function minimumVariance(means: number[], covariance: number[][], riskFree: number, target?: number): PortfolioPoint {
  const n = means.length
  let best: PortfolioPoint | undefined
  const consider = (weights: number[]) => {
    if (weights.some(w => w < -1e-7) || Math.abs(weights.reduce((a, b) => a + b, 0) - 1) > 1e-6) return
    if (target !== undefined && Math.abs(weights.reduce((s, w, i) => s + w * means[i], 0) - target) > 1e-6) return
    const clipped = weights.map(w => Math.max(0, w)), total = clipped.reduce((a, b) => a + b, 0)
    const p = portfolioPoint(clipped.map(w => w / total), means, covariance, riskFree)
    if (!best || p.volatility < best.volatility) best = p
  }
  for (let mask = 1; mask < 2 ** n; mask++) {
    const ids = means.map((_, i) => i).filter(i => mask & (1 << i)), m = ids.length
    if (m === 1) { consider(means.map((_, i) => i === ids[0] ? 1 : 0)); continue }
    const constraints = [ids.map(() => 1)]
    const rhs = [1]
    if (target !== undefined) {
      const spread = Math.max(...ids.map(i => means[i])) - Math.min(...ids.map(i => means[i]))
      if (spread < 1e-10) {
        if (Math.abs(means[ids[0]] - target) > 1e-7) continue
      } else { constraints.push(ids.map(i => means[i])); rhs.push(target) }
    }
    const c = constraints.length
    const matrix = Array.from({ length: m + c }, (_, i) => Array.from({ length: m + c }, (_, j) =>
      i < m && j < m ? covariance[ids[i]][ids[j]] + (i === j ? 1e-10 : 0) :
      i < m ? constraints[j - m][i] : j < m ? constraints[i - m][j] : 0))
    const solution = solve(matrix, [...ids.map(() => 0), ...rhs])
    if (solution) consider(means.map((_, i) => { const k = ids.indexOf(i); return k < 0 ? 0 : solution[k] }))
  }
  if (!best) throw new Error('No feasible portfolio for this target return.')
  return best
}

export function buildPortfolio(assets: AssetSeries[], riskFree: number): PortfolioModel {
  if (assets.length < 2 || assets.length > 8) throw new Error('Choose between 2 and 8 assets.')
  if (!Number.isFinite(riskFree) || riskFree <= -1) throw new Error('Provide a finite annual risk-free rate greater than −100%.')
  if (new Set(assets.map(a => a.name)).size !== assets.length) throw new Error('Each asset must have a unique symbol.')
  if (new Set(assets.map(a => a.currency)).size !== 1) throw new Error('All series must use the same currency; convert mixed currencies first.')
  const maps = assets.map(a => {
    const map = new Map<string, number>()
    for (const p of a.points) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(Date.parse(p.date)) || !Number.isFinite(p.value) || p.value <= 0 || map.has(p.date)) throw new Error(`${a.name}: invalid date, duplicate date or non-positive value.`)
      map.set(p.date, p.value)
    }
    return map
  })
  const dates = [...maps[0].keys()].filter(d => maps.every(m => m.has(d))).sort()
  if (dates.length < 61) throw new Error('At least 61 common daily observations are required.')
  // Reject missing sessions rather than treating multi-session returns as daily observations.
  for (const map of maps) {
    const window = [...map.keys()].filter(d => d >= dates[0] && d <= dates.at(-1)!)
    if (window.length !== dates.length) throw new Error('Missing sessions inside the shared date range. Import complete, aligned daily histories.')
  }
  const returns = maps.map(m => dates.slice(1).map((d, i) => m.get(d)! / m.get(dates[i])! - 1))
  const count = dates.length - 1, dailyMeans = returns.map(r => r.reduce((a, b) => a + b, 0) / count)
  const means = dailyMeans.map(m => m * 252)
  const covariance = returns.map((r, i) => returns.map((s, j) => r.reduce((sum, v, t) => sum + (v - dailyMeans[i]) * (s[t] - dailyMeans[j]), 0) / (count - 1) * 252))
  const minimum = minimumVariance(means, covariance, riskFree), maximum = Math.max(...means)
  const frontier = Array.from({ length: 81 }, (_, i) => minimumVariance(means, covariance, riskFree, minimum.mean + (maximum - minimum.mean) * i / 80))
  const equal = portfolioPoint(means.map(() => 1 / means.length), means, covariance, riskFree)
  const best = frontier.reduce((a, b) => (b.sharpe ?? -Infinity) > (a.sharpe ?? -Infinity) ? b : a, minimum)
  return { assets, dates, means, covariance, frontier, minimum, equal, best }
}
