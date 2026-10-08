import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { stockRequest } from './api'
import { buildPortfolio, portfolioPoint, readAsset } from './portfolio'
import type { AssetSeries, PortfolioModel, PortfolioPoint } from './portfolio'
import './PortfolioWorkbench.css'

const pct = (v: number) => `${(100 * v).toFixed(2)}%`
const defaults = 'ADBE:NASDAQ, SPY:ARCA, TSLA:NASDAQ, AMZN:NASDAQ, ANET:NYSE, AMD:NASDAQ'
function historyPause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Cancelled')); return }
    const cancel = () => { clearTimeout(timer); reject(new Error('Cancelled')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, 15500)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

export function PortfolioWorkbench() {
  const [symbols, setSymbols] = useState(defaults), [years, setYears] = useState(5)
  const [mode, setMode] = useState<'prices' | 'strategy'>('prices'), [rf, setRf] = useState(0)
  const [assets, setAssets] = useState<AssetSeries[]>([]), [model, setModel] = useState<PortfolioModel | null>(null)
  const [selected, setSelected] = useState<PortfolioPoint | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  useEffect(() => () => { generation.current++; controller.current?.abort() }, [])
  const reset = () => { setModel(null); setSelected(null); setError('') }
  function analyse(input: AssetSeries[], rate: number) {
    reset()
    try { const next = buildPortfolio(input, rate / 100); setModel(next); setSelected(next.equal) }
    catch (e) { setError(e instanceof Error ? e.message : 'Portfolio analysis failed.') }
  }
  async function load(event: FormEvent) {
    event.preventDefault(); reset(); setAssets([]); setBusy(true)
    const run = ++generation.current, c = new AbortController(); controller.current?.abort(); controller.current = c
    try {
      const queries = symbols.split(',').map(s => { const [symbol, primaryExchange = 'NASDAQ'] = s.trim().toUpperCase().split(':'); return { symbol, primaryExchange, years } })
      if (queries.length < 2 || queries.length > 8 || queries.some(q => !/^[A-Z][A-Z0-9.-]*$/.test(q.symbol) || !['NASDAQ', 'NYSE', 'ARCA', 'AMEX'].includes(q.primaryExchange)) || new Set(queries.map(q => q.symbol)).size !== queries.length) throw new Error('Enter 2–8 unique SYMBOL:EXCHANGE entries separated by commas.')
      // The broker history connection serves requests sequentially.
      const loaded: AssetSeries[] = []
      for (const [i, q] of queries.entries()) {
        setProgress(`Loading ${q.symbol} (${i + 1}/${queries.length})${i ? ' · waiting for IBKR pacing' : ''}…`)
        if (i) await historyPause(c.signal)
        let history: unknown
        try { history = await stockRequest('/api/market-data/stocks/history', q, c.signal) }
        catch (e) {
          if (!(e instanceof Error) || !e.message.includes('15 seconds')) throw e
          setProgress(`Waiting for IBKR pacing · ${q.symbol} (${i + 1}/${queries.length})…`)
          await historyPause(c.signal)
          history = await stockRequest('/api/market-data/stocks/history', q, c.signal)
        }
        loaded.push(readAsset(history, 'prices'))
      }
      if (run !== generation.current) return
      setAssets(loaded); analyse(loaded, rf)
    } catch (e) { if (run === generation.current && !c.signal.aborted) setError(e instanceof Error ? e.message : 'History request failed.') }
    finally { if (run === generation.current) setBusy(false) }
  }
  async function importFiles(files: File[]) {
    reset(); setAssets([]); setBusy(true); setProgress('Importing daily series…')
    const run = ++generation.current; controller.current?.abort()
    try {
      const imported = await Promise.all(files.map(async file => readAsset(JSON.parse(await file.text()), mode)))
      if (run !== generation.current) return
      setAssets(imported); analyse(imported, rf)
    } catch (e) { if (run === generation.current) setError(e instanceof Error ? e.message : 'Import failed.') }
    finally { if (run === generation.current) setBusy(false) }
  }
  return <div className="portfolio-workbench">
    <section className="intro"><div><p className="eyebrow">MODERN PORTFOLIO THEORY</p><h1>Find the balance.<br />Explore the frontier.</h1></div><p>Compare multi-asset allocations using historical mean returns and covariance. Select a point to inspect its portfolio weights.</p></section>
    <div className="workspace">
      <section className="panel controls">
        <h2>Portfolio inputs</h2>
        <label className="field">Series to analyse<select value={mode} disabled={busy} onChange={e => { setMode(e.target.value as typeof mode); setAssets([]); reset() }}><option value="prices">Stock prices</option><option value="strategy">Strategy equity curves</option></select></label>
        {mode === 'prices' && <form onSubmit={load} className="portfolio-form">
          <label className="field">Symbols and exchanges<textarea aria-label="Symbols and exchanges" value={symbols} onChange={e => setSymbols(e.target.value)} required disabled={busy} /></label>
          <label className="field">History<select value={years} disabled={busy} onChange={e => setYears(+e.target.value)}>{[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>{y} year{y > 1 ? 's' : ''}</option>)}</select></label>
          <button className="primary" disabled={busy}>Load IBKR & calculate <span>→</span></button>
        </form>}
        <label className="field">Import {mode === 'strategy' ? 'exported backtests' : 'histories or exported backtests'}<input type="file" accept=".json,application/json" multiple disabled={busy} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void importFiles(files) }} /></label>
        <p className="note">Select 2–8 JSON files together. Export each holding from Stock strategies. Strategy mode uses its daily equity curve, including simulated trading costs.</p>
        <label className="field">Annual risk-free rate (%)<input type="number" step="0.1" min="-99" max="100" value={rf} disabled={busy} onChange={e => { setRf(e.target.valueAsNumber); reset() }} /></label>
        <button className="primary" disabled={busy || !assets.length} onClick={() => analyse(assets, rf)}>Recalculate</button>
        <p className="note">Use a benchmark in the series currency. Default 0% is an assumption, not a current market rate.</p>
        {busy && <><p role="status">{progress || 'Loading daily series…'}</p><button type="button" className="text-button" onClick={() => { generation.current++; controller.current?.abort(); setBusy(false); reset() }}>Cancel loading</button></>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="results" aria-busy={busy}>
        {model && selected ? <>
          <section className="panel chart-panel">
            <div className="panel-heading"><div><p className="eyebrow">LONG-ONLY · FULLY INVESTED</p><h2>Efficient frontier</h2></div><span className="muted">{model.assets[0].currency} · {model.dates.length - 1} returns</span></div>
            <FrontierChart model={model} selected={selected} select={setSelected} rf={rf / 100} />
            <div className="portfolio-presets"><button onClick={() => setSelected(model.minimum)}>Minimum variance</button><button onClick={() => setSelected(model.equal)}>Equal weights</button><button onClick={() => setSelected(model.best)}>Best Sharpe on sampled frontier</button></div>
            <label className="field">Explore efficient portfolios<input type="range" min="0" max="80" value={model.frontier.reduce((best, p, i) => Math.abs(p.mean - selected.mean) < Math.abs(model.frontier[best].mean - selected.mean) ? i : best, 0)} onChange={e => setSelected(model.frontier[+e.target.value])} /></label>
            <p className="note">Shared dates: {model.dates[0]} — {model.dates.at(-1)}. Annualised arithmetic mean and sample covariance use 252 trading sessions; return is not CAGR.</p>
          </section>
          <section className="portfolio-metrics">{[['Estimated annual return', pct(selected.mean)], ['Annual volatility', pct(selected.volatility)], ['Sharpe ratio', selected.sharpe?.toFixed(2) ?? 'Undefined']].map(([label, value]) => <article className="metric" key={label}><p>{label}</p><strong>{value}</strong></article>)}</section>
          <section className="panel table-panel"><h2>Selected allocation</h2><div className="table-scroll"><table><thead><tr><th>Asset</th><th>Weight</th><th>Per 10,000 {model.assets[0].currency}</th><th>Annual mean</th><th>Volatility</th></tr></thead><tbody>{model.assets.map((a, i) => <tr key={a.name}><td>{a.name}</td><td>{pct(selected.weights[i])}</td><td>{(selected.weights[i] * 10000).toFixed(2)}</td><td>{pct(model.means[i])}</td><td>{pct(Math.sqrt(model.covariance[i][i]))}</td></tr>)}</tbody></table></div></section>
          <section className="panel table-panel"><h2>Annualised covariance matrix</h2><p className="note">Decimal-return squared units; diagonal entries are variances.</p><div className="table-scroll"><table><thead><tr><th>Asset</th>{model.assets.map(a => <th key={a.name}>{a.name}</th>)}</tr></thead><tbody>{model.covariance.map((row, i) => <tr key={model.assets[i].name}><td>{model.assets[i].name}</td>{row.map((v, j) => <td key={j}>{v.toFixed(6)}</td>)}</tr>)}</tbody></table></div></section>
          <section className="panel table-panel"><h2>Model assumptions</h2><p className="note">Historical estimates, not forecasts. No short selling or leverage. Weights sum to 100%; fixed-weight risk assumes rebalancing, whose additional costs are excluded. Optimisation uses a tiny diagonal stabiliser (1e-10); displayed risk uses the original covariance. Inflation and currency conversion are excluded. Imported strategies can share market exposure.</p>{model.assets.map(a => <p className="note" key={a.name}>{a.name}: {a.basis}</p>)}</section>
        </> : <div className="panel empty"><h2>Start with aligned daily data.</h2><p>Load your six holdings or import their strategy backtests.</p><p className="note">Summary returns and drawdowns alone cannot determine a frontier.</p></div>}
      </section>
    </div>
  </div>
}

function FrontierChart({ model, selected, select, rf }: { model: PortfolioModel; selected: PortfolioPoint; select: (p: PortfolioPoint) => void; rf: number }) {
  const individual = model.means.map((_, i) => portfolioPoint(model.means.map((_, j) => i === j ? 1 : 0), model.means, model.covariance, rf))
  const points = [...model.frontier, model.equal, ...individual]
  const maxX = Math.max(.01, ...points.map(p => p.volatility)) * 1.15
  const low = Math.min(0, ...points.map(p => p.mean)), high = Math.max(.01, ...points.map(p => p.mean)), pad = Math.max(.01, (high - low) * .12)
  const minY = low - pad, maxY = high + pad
  const x = (v: number) => 70 + v / maxX * 660, y = (v: number) => 25 + (maxY - v) / (maxY - minY) * 310
  return <div className="frontier-chart"><svg viewBox="0 0 800 410" role="img" aria-label="Efficient frontier: annual volatility on the horizontal axis and estimated annual return on the vertical axis">
    {Array.from({ length: 6 }, (_, i) => { const vx = maxX * i / 5, vy = minY + (maxY - minY) * i / 5; return <g key={i}><line x1="70" x2="730" y1={y(vy)} y2={y(vy)} /><text x="62" y={y(vy) + 4} textAnchor="end">{pct(vy)}</text><text x={x(vx)} y="358" textAnchor="middle">{pct(vx)}</text></g> })}
    <polyline className="frontier-line" points={model.frontier.map(p => `${x(p.volatility)},${y(p.mean)}`).join(' ')} />
    {model.frontier.map((p, i) => <circle key={i} className="frontier-hit" cx={x(p.volatility)} cy={y(p.mean)} r="5" onClick={() => select(p)}><title>{pct(p.mean)} return, {pct(p.volatility)} volatility</title></circle>)}
    {individual.map((p, i) => <g key={i}><circle className="asset-dot" cx={x(p.volatility)} cy={y(p.mean)} r="4" /><text x={x(p.volatility) + 7} y={y(p.mean) - 8}>{model.assets[i].name}</text></g>)}
    <circle className="equal-dot" cx={x(model.equal.volatility)} cy={y(model.equal.mean)} r="6"><title>Equal weights</title></circle>
    <circle className="selected-dot" cx={x(selected.volatility)} cy={y(selected.mean)} r="8"><title>Selected portfolio</title></circle>
    <text x="400" y="397" textAnchor="middle">Annual volatility (risk)</text><text transform="translate(16 190) rotate(-90)" textAnchor="middle">Estimated annual return</text>
  </svg><p className="note">Green: efficient frontier · Blue: individual assets · White: equal weights · Orange ring: selected portfolio. Use the slider or portfolio buttons to select an allocation.</p></div>
}
