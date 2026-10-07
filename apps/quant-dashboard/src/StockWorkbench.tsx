import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { stockRequest } from './api'
import { drawdowns, priceOverlays, readAlgorithmCatalog, rsi, runStats } from './stockTypes'
import type { Series, StockAlgorithm, StockHistory, StockQuery, StockResponse, StockSettings } from './stockTypes'
import './StockWorkbench.css'

// Shown until the algorithm catalog loads; the catalog then supplies the real defaults.
const defaults: StockSettings = { algorithm: 'sma-long-cash', parameters: { fastWindow: 20, slowWindow: 50 }, initialCash: 10000, allocation: .95, feeBps: 5, slippageBps: 5 }
const parametersOf = (a: StockAlgorithm): Record<string, number> => Object.fromEntries(a.parameters.map(p => [p.key, p.default]))
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v)
const percent = (v: number) => `${(v * 100).toFixed(2)}%`
const optionalPercent = (v: number | null) => v === null ? '—' : percent(v)
const ratio = (v: number | null) => v === null ? '—' : v.toFixed(2)
const number = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 4 })

export function StockWorkbench() {
  const [algorithms, setAlgorithms] = useState<StockAlgorithm[]>([])
  const [query, setQuery] = useState<StockQuery>({ symbol: 'AAPL', primaryExchange: 'NASDAQ', years: 1 })
  const [settings, setSettings] = useState(defaults)
  const [history, setHistory] = useState<StockHistory | null>(null)
  const [response, setResponse] = useState<StockResponse | null>(null)
  const [lastSettings, setLastSettings] = useState<StockSettings | null>(null)
  const [busy, setBusy] = useState<'history' | 'backtest' | null>(null)
  const [error, setError] = useState('')
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    const c = new AbortController()
    stockRequest<unknown>('/api/strategies', undefined, c.signal).then(value => {
      if (c.signal.aborted) return
      const list = readAlgorithmCatalog(value)
      setCatalogError('')
      setAlgorithms(list)
      setSettings(s => {
        const a = list.find(x => x.id === s.algorithm) ?? list[0]
        return a ? { ...s, algorithm: a.id, parameters: parametersOf(a) } : s
      })
    }).catch(e => { if (!c.signal.aborted) setCatalogError(e instanceof Error ? e.message : 'Cannot load algorithms.') })
    return () => { c.abort(); controller.current?.abort() }
  }, [catalogAttempt])
  const algorithm = algorithms.find(a => a.id === settings.algorithm)
  const selectAlgorithm = (id: string) => {
    const next = algorithms.find(a => a.id === id)
    if (next) setSettings({ ...settings, algorithm: id, parameters: parametersOf(next) })
  }
  const setParameter = (key: string, value: number) => setSettings({ ...settings, parameters: { ...settings.parameters, [key]: value } })
  const updateQuery = (next: StockQuery) => { setQuery(next); setHistory(null); setResponse(null); setError('') }
  async function load(event: FormEvent) {
    event.preventDefault(); controller.current?.abort()
    const c = new AbortController(); controller.current = c
    setBusy('history'); setError(''); setHistory(null); setResponse(null)
    try { setHistory(await stockRequest<StockHistory>('/api/market-data/stocks/history', query, c.signal)) }
    catch (e) { if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'History request failed.') }
    finally { if (!c.signal.aborted) setBusy(null) }
  }
  async function run(event: FormEvent) {
    event.preventDefault()
    if (!history) return
    const c = new AbortController(); controller.current = c
    const submitted = { ...settings, parameters: { ...settings.parameters } }
    setBusy('backtest'); setError('')
    try {
      // Cross-parameter rules (e.g. fast < slow) are validated by the engine and shown below.
      const value = await stockRequest<StockResponse>('/api/strategies/stocks/backtest', { ...submitted, datasetId: history.datasetId }, c.signal)
      setResponse(value); setLastSettings(submitted)
    } catch (e) { if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'Backtest failed.') }
    finally { if (!c.signal.aborted) setBusy(null) }
  }
  const changed = response && JSON.stringify(settings) !== JSON.stringify(lastSettings)
  return <div className="stock-workbench">
    <section className="intro"><div><p className="eyebrow">STRATEGY LAB · STOCKS</p><h1>Test the idea.<br />Measure the outcome.</h1></div><p>Explore trend, momentum and mean-reversion strategies on IBKR daily history. Compare with buy-and-hold, inspect drawdowns and understand every simulated fill.</p></section>
    <div className="stock-mode"><span>Historical simulation</span><span>USD stocks · daily bars</span><span>No brokerage orders</span></div>
    <div className="stock-layout">
      <aside className="stock-sidebar">
        <form className="panel stock-form" onSubmit={load}>
          <h2><span className="stock-step">01</span> Market data</h2>
          <fieldset disabled={busy !== null}>
            <label>Stock symbol<input required maxLength={15} value={query.symbol} onChange={e => updateQuery({ ...query, symbol: e.target.value.toUpperCase() })} /></label>
            <label>Primary listing exchange<select value={query.primaryExchange} onChange={e => updateQuery({ ...query, primaryExchange: e.target.value })}><option>NASDAQ</option><option>NYSE</option><option>ARCA</option><option>AMEX</option></select></label>
            <label>History<select value={query.years} onChange={e => updateQuery({ ...query, years: +e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} year{n > 1 ? 's' : ''}</option>)}</select></label>
            <button className="stock-secondary" type="submit">{busy === 'history' ? 'Requesting IBKR history…' : history ? 'Refresh IBKR history' : 'Load IBKR history'}</button>
          </fieldset>
          <p className="note">Uses your API’s TWS / IB Gateway connection. Completed sessions only; today is excluded.</p>
        </form>
        <form className="panel stock-form" onSubmit={run}>
          <h2><span className="stock-step">02</span> Algorithm</h2>
          <fieldset disabled={busy !== null}>
            <label>Strategy<select value={settings.algorithm} onChange={e => selectAlgorithm(e.target.value)}>{algorithms.length ? algorithms.map(a => <option key={a.id} value={a.id}>{a.name}</option>) : <option value={settings.algorithm}>Loading algorithms…</option>}</select></label>
            {catalogError && <div role="alert" className="error">{catalogError} <button type="button" className="text-button" onClick={() => { setCatalogError(''); setCatalogAttempt(n => n + 1) }}>Retry</button></div>}
            {algorithm?.description && <p className="note">{algorithm.description}</p>}
            <div className="stock-input-pair">
              {algorithm?.parameters.map(p => <Numeric key={`${algorithm.id}-${p.key}`} label={p.label} value={settings.parameters[p.key] ?? p.default} min={p.min} max={p.max} step={p.step} set={v => setParameter(p.key, v)} />)}
            </div>
            <Numeric label="Initial cash (USD)" value={settings.initialCash} min={1} max={1e9} step="any" set={v => setSettings({ ...settings, initialCash: v })} />
            <Numeric label="Entry allocation (%)" value={settings.allocation * 100} min={.01} max={100} step="any" set={v => setSettings({ ...settings, allocation: v / 100 })} />
            <div className="stock-input-pair">
              <Numeric label="Fees (bps / side)" value={settings.feeBps} min={0} max={1000} step="any" set={v => setSettings({ ...settings, feeBps: v })} />
              <Numeric label="Slippage (bps / side)" value={settings.slippageBps} min={0} max={1000} step="any" set={v => setSettings({ ...settings, slippageBps: v })} />
            </div>
            <button className="primary" disabled={!history || !algorithm || busy !== null}>{busy === 'backtest' ? 'Running simulation…' : 'Run backtest'} <span>→</span></button>
          </fieldset>
          <p className="note">Load data once, then compare parameters on the same dataset for up to 30 minutes.</p>
        </form>
      </aside>
      <section className="results stock-results" aria-busy={busy !== null}>
        {error && <div className="panel stock-message error" role="alert">{error}</div>}
        {history && <div className="panel stock-data" role="status"><strong>{history.symbol} <span>{history.primaryExchange} · conId {history.contractId}</span></strong><p>{history.bars.length} sessions · {history.bars[0].date} — {history.bars.at(-1)!.date}</p><small>{history.source} · fetched {new Date(history.fetchedAt).toLocaleString()}</small><small>{history.priceBasis}</small></div>}
        {changed && <div className="stock-stale" role="status">Parameters changed. The charts show the previous run; select Run backtest to update them.</div>}
        {response && history ? <StockResults response={response} history={history} algorithm={algorithms.find(a => a.id === response.result.strategy)} /> : <div className="panel stock-empty"><span className="stock-empty-icon">↗</span><p className="eyebrow">FROM MARKET DATA TO EVIDENCE</p><h2>{busy === 'history' ? 'Loading from IBKR…' : history ? 'Your data is ready.' : 'Start with a stock.'}</h2><p>{history ? 'Adjust the strategy parameters and run a backtest.' : 'Load daily history through your existing IBKR connection, then test the strategy on those prices.'}</p><div>01 Load history <span>→</span> 02 Set parameters <span>→</span> 03 Compare results</div></div>}
      </section>
    </div>
  </div>
}
function Numeric({ label, value, min, max, step, set }: { label: string; value: number; min: number; max: number; step: number | 'any'; set: (v: number) => void }) {
  return <label>{label}<input required type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={e => set(e.target.valueAsNumber)} /></label>
}
function StockResults({ response, history, algorithm }: { response: StockResponse; history: StockHistory; algorithm?: StockAlgorithm }) {
  const r = response.result
  const [index, setIndex] = useState(0)
  const cursor = Math.min(index, r.equity.length - 1)
  const selected = r.equity[cursor]
  const overlays = useMemo(() => priceOverlays(r.strategy, r.parameters, history.bars), [r, history.bars])
  const rsiValues = useMemo(() => r.strategy === 'rsi-mean-reversion' ? rsi(history.bars, r.parameters.rsiPeriod) : null, [r, history.bars])
  const dd = useMemo(() => drawdowns(r.equity, r.initialCash), [r])
  const stats = useMemo(() => runStats(r.equity, r.trades, r.initialCash, r.warmupBars), [r])
  const dates = r.equity.map(e => e.date)
  const parameterText = (algorithm ? algorithm.parameters.map(p => r.parameters[p.key]) : Object.values(r.parameters)).join(' / ')
  function download() {
    const blob = new Blob([JSON.stringify({ history, ...response }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `${history.symbol}-backtest.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const metricRow = (rows: string[][]) => <div className="stock-metrics">{rows.map(([label, value, note]) => <article className="metric" key={label}><p>{label}</p><strong>{value}</strong><small>{note}</small></article>)}</div>
  const priceSeries: Series[] = [{ name: 'Close', color: '#d9e2e6', values: history.bars.map(b => b.close) }, ...overlays]
  return <>
    <div className="stock-run"><span>{algorithm?.name ?? r.strategy} · {parameterText} · {percent(r.allocation)} allocation · {r.feeBps} bp fees + {r.slippageBps} bp slippage</span><button className="text-button" onClick={download}>Export results ↓</button></div>
    {metricRow([
      ['Final equity', money(r.finalEquity), `From ${money(r.initialCash)}`],
      ['Strategy return', percent(r.totalReturn), 'After simulated trading costs'],
      ['Buy & hold', percent(r.benchmarkReturn), 'Same start, allocation and entry costs'],
      ['Maximum drawdown', percent(r.maxDrawdown), `Daily close peak-to-trough · buy & hold ${percent(stats.benchmarkMaxDrawdown)}`],
    ])}
    {metricRow([
      ['Sharpe ratio', ratio(stats.sharpe), `Buy & hold ${ratio(stats.benchmarkSharpe)} · daily returns, 0% risk-free`],
      ['CAGR', optionalPercent(stats.cagr), `Buy & hold ${optionalPercent(stats.benchmarkCagr)} · annualised`],
      ['Time in market', percent(stats.exposure), 'Sessions holding shares'],
      ['Win rate', stats.closedTrades ? percent(stats.wins / stats.closedTrades) : '—', `${stats.closedTrades} closed round trips`],
    ])}
    <SeriesChart title="Portfolio value" subtitle="Strategy vs buy-and-hold · USD" dates={dates} cursor={cursor} series={[
      { name: 'Strategy', color: '#c7ff58', values: r.equity.map(e => e.equity) },
      { name: 'Buy & hold', color: '#67d7ff', values: r.equity.map(e => e.benchmarkEquity) },
    ]} />
    <div className="panel stock-inspector"><label htmlFor="stock-date">Inspect session: <strong>{selected.date}</strong></label><input id="stock-date" type="range" min={0} max={r.equity.length - 1} value={cursor} onChange={e => setIndex(+e.target.value)} /><div><span>Equity <b>{money(selected.equity)}</b></span><span>Cash <b>{money(selected.cash)}</b></span><span>Shares <b>{number(selected.shares)}</b></span><span>Drawdown <b>{dd[cursor].toFixed(2)}%</b></span></div></div>
    <SeriesChart title="Price and indicators" subtitle={`Split-adjusted close${overlays.length ? ' · ' + overlays.map(o => o.name).join(' / ') : ''}`} dates={dates} cursor={cursor} series={priceSeries} />
    {rsiValues && <SeriesChart title={`RSI(${r.parameters.rsiPeriod})`} subtitle="Relative strength index with entry and exit thresholds" dates={dates} cursor={cursor} series={[
      { name: 'RSI', color: '#d9e2e6', values: rsiValues },
      { name: `Entry below ${r.parameters.entryBelow}`, color: '#c7ff58', values: dates.map(() => r.parameters.entryBelow) },
      { name: `Exit above ${r.parameters.exitAbove}`, color: '#ff7d79', values: dates.map(() => r.parameters.exitAbove) },
    ]} />}
    <SeriesChart title="Drawdown" subtitle="Decline from previous equity peak · %" dates={dates} cursor={cursor} series={[{ name: 'Drawdown %', color: '#ff7d79', values: dd }]} />
    <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">SIMULATED FILLS</p><h2>{r.trades.length} fills · {money(r.totalFees)} fees</h2></div></div><p className="note">Historical simulations only. Open positions remain marked to the final close; no final liquidation is assumed.</p><div className="table-scroll stock-trades"><table><thead><tr><th>Signal close</th><th>Execution open</th><th>Side</th><th>Shares</th><th>Fill price</th><th>Fee</th></tr></thead><tbody>{r.trades.map((t, i) => <tr key={i}><td>{t.signalDate}</td><td>{t.executionDate}</td><td className={t.side === 'Buy' ? 'positive' : 'negative'}>{t.side}</td><td>{number(t.shares)}</td><td>{money(t.price)}</td><td>{money(t.fee)}</td></tr>)}{!r.trades.length && <tr><td colSpan={6}>No signals led to a fill in this period.</td></tr>}</tbody></table></div></section>
    <p className="note">Price-return simulation: cash dividends, interest, taxes and market impact are excluded. Fractional adjusted shares are assumed. Sharpe, CAGR and time in market are measured from the first session the strategy could trade. Repeatedly tuning parameters on this period can overfit; evaluate a separate period before drawing conclusions.</p>
  </>
}
function SeriesChart({ title, subtitle, dates, series, cursor }: { title: string; subtitle: string; dates: string[]; series: Series[]; cursor: number }) {
  const values = series.flatMap(s => s.values.filter((n): n is number => n !== null))
  const low = Math.min(...values), high = Math.max(...values), pad = (high - low || Math.abs(high) || 1) * .08
  const min = low - pad, max = high + pad
  const x = (i: number) => 74 + i / Math.max(1, dates.length - 1) * 740
  const y = (n: number) => 22 + (max - n) / (max - min) * 204
  return <section className="panel stock-chart"><div className="panel-heading"><div><h2>{title}</h2><p className="note">{subtitle}</p></div><div className="stock-legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div></div><svg viewBox="0 0 840 266" role="img" aria-label={`${title}. Use the session slider for exact values.`}>{[0, 1, 2, 3].map(i => { const v = min + i / 3 * (max - min); return <g key={i}><line x1={74} x2={814} y1={y(v)} y2={y(v)} stroke="#26353c" /><text x={64} y={y(v) + 4} textAnchor="end">{v.toLocaleString('en-US', { maximumFractionDigits: 1 })}</text></g> })}{series.map(s => <path key={s.name} d={s.values.map((v, i) => v === null ? '' : `${i === 0 || s.values[i - 1] === null ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} />)}<line x1={x(cursor)} x2={x(cursor)} y1={20} y2={228} stroke="#91a2a9" strokeDasharray="4 5" />{series.map(s => s.values[cursor] !== null && <circle key={s.name} cx={x(cursor)} cy={y(s.values[cursor]!)} r={4} fill={s.color}><title>{`${dates[cursor]} · ${s.name}: ${number(s.values[cursor]!)}`}</title></circle>)}<text x={74} y={255}>{dates[0]}</text><text x={814} y={255} textAnchor="end">{dates.at(-1)}</text></svg><div className="stock-chart-values">{dates[cursor]} {series.map(s => <span key={s.name}>{s.name}: <b>{s.values[cursor] === null ? 'Warming up' : number(s.values[cursor]!)}</b></span>)}</div></section>
}
