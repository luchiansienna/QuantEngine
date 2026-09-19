import { useState } from 'react'
import type { FormEvent } from 'react'
import { postRisk } from './api'
import { downloadFile, exposureCsv, parseExposures } from './riskCsv'
import type { CreditInput, CreditResult, ExposureRow, HistoricalResult, ReconResult, RiskInput, RiskResult } from './riskTypes'
import './RiskWorkbench.css'
const defaults: RiskInput = { spot: 100, rate: .03, dividendYield: 0, volatility: .2, maturity: 1,
  confidence: .95, physicalDrift: .05, horizonDays: 10, collateral: 0, hazardRate: .02,
  recovery: .4, paths: 10000, steps: 12, seed: 42, trades: [{ quantity: 1000, strike: 100 }] }
const fmt = (x: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 }).format(x)
const message = (e: unknown) => e instanceof Error ? e.message : 'The request failed.'
type FieldSpec<T> = [keyof T, string, number, number, number, number?]
const fields: FieldSpec<RiskInput>[] = [
  ['spot', 'Spot', 1, .0001, 1e6], ['volatility', 'Volatility (%)', 100, 0, 200],
  ['rate', 'Risk-free rate (%)', 100, -10, 50], ['dividendYield', 'Dividend yield (%)', 100, 0, 50],
  ['maturity', 'Maturity (years)', 1, .01, 30], ['confidence', 'Confidence (%)', 100, 50, 99.99],
  ['horizonDays', 'VaR horizon (trading days)', 1, 1, 252, 1], ['physicalDrift', 'Physical total-return drift (%)', 100, -50, 50],
  ['collateral', 'Fixed collateral received', 1, 0, 1e12], ['hazardRate', 'Q hazard rate (% per year)', 100, 0, 500],
  ['recovery', 'Recovery (%)', 100, 0, 100], ['paths', 'Simulation paths', 1, 100, 100000, 1],
  ['steps', 'Exposure time steps', 1, 1, 120, 1], ['seed', 'Random seed', 1, 0, 4294967295, 1],
]
export function RiskWorkbench() {
  const [tab, setTab] = useState('exposure')
  return <div className="risk-workbench">
    <section className="intro"><div><p className="eyebrow">CREDIT & MARKET RISK LAB</p><h1>Risk Workbench</h1></div><p>Explore future exposure, market losses and the cost of default. Compare engine output with reporting records.</p></section>
    <nav className="risk-tabs" aria-label="Risk analysis">{[['exposure', 'PFE, CVA & Monte Carlo VaR'], ['credit', 'Credit bond pricing'], ['historical', 'Historical VaR'], ['reconcile', 'Exposure reconciliation']].map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'exposure' && <ExposurePanel />}{tab === 'credit' && <CreditPanel />}{tab === 'historical' && <HistoricalPanel />}{tab === 'reconcile' && <ReconciliationPanel />}
  </div>
}
function Numeric({ label, value, onChange, min, max, step = 'any' }: { label: string; value: number; onChange: (x: number) => void; min?: number; max?: number; step?: number | 'any' }) {
  return <label className="risk-field"><span>{label}</span><input type="number" required value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={e => onChange(e.target.valueAsNumber)} /></label>
}
function Metric({ title, value, note }: { title: string; value: number; note: string }) {
  return <article className="metric"><div className="metric-label">{title}</div><strong>{new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(value)}</strong><small>{note}</small></article>
}
function ExposurePanel() {
  const [input, setInput] = useState(defaults)
  const [result, setResult] = useState<RiskResult | null>(null); const [snapshot, setSnapshot] = useState<RiskInput | null>(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [metadata, setMetadata] = useState({ counterparty: 'DEMO-CP', nettingSet: 'NS-001', currency: 'USD', asOf: new Date().toISOString().slice(0, 10) })
  const change = (key: keyof RiskInput, value: number) => { setInput(x => ({ ...x, [key]: value })); setResult(null) }
  async function run(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setResult(null)
    try { const r = await postRisk<RiskResult>('analyse', input); setResult(r); setSnapshot(structuredClone(input)) }
    catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  async function exportExposure() {
    if (!result || !snapshot) return
    try {
      if (!metadata.counterparty.trim() || !metadata.nettingSet.trim() || !/^[A-Z]{3}$/.test(metadata.currency) || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.asOf)) throw new Error('Set counterparty, netting set, ISO date and uppercase three-letter currency before export.')
      const bytes = new TextEncoder().encode(JSON.stringify({ input: snapshot, model: result.modelVersion }))
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('')
      const rows: ExposureRow[] = result.profile.flatMap(p => (['EE', 'PFE'] as const).map(metric => ({ ...metadata, counterparty: metadata.counterparty.trim(), nettingSet: metadata.nettingSet.trim(), tradeId: 'NETTING-SET', metric,
        tenor: Number(p.time.toFixed(10)), confidence: result.confidence, modelVersion: result.modelVersion, scenarioId: hash,
        value: metric === 'EE' ? p.expectedExposure : p.pfe })))
      downloadFile('engine-exposures.csv', exposureCsv(rows))
    } catch (e) { setError(message(e)) }
  }
  return <>
    <p className="risk-note">One underlying, currency, maturity and enforceable netting set. Signed quantities are forward units; negative means short. Exposure = max(net value − fixed collateral, 0). Educational models with user-entered market assumptions.</p>
    <div className="workspace"><form className="panel controls" onSubmit={run}>
      <div className="panel-heading"><h2>Forward portfolio</h2><button type="button" disabled={busy} onClick={() => { setInput(structuredClone(defaults)); setResult(null); setError('') }}>Reset</button></div>
      <fieldset disabled={busy}><div className="risk-grid">{fields.map(([key, label, scale, min, max, step]) => <Numeric key={key} label={label} value={(input[key] as number) * scale} min={min} max={max} step={step} onChange={v => change(key, v / scale)} />)}</div>
        <p className="risk-note">Q means risk-neutral. Hazard rate is a default intensity, not an annual default probability. Paths × steps ≤ 2,000,000.</p>
        {input.trades.map((t, i) => <div className="risk-trade" key={i}>
          <Numeric label={`Trade ${i + 1} quantity`} value={t.quantity} min={-1e8} max={1e8} onChange={v => { setInput(x => ({ ...x, trades: x.trades.map((a, j) => j === i ? { ...a, quantity: v } : a) })); setResult(null) }} />
          <Numeric label={`Trade ${i + 1} strike`} value={t.strike} min={.0001} max={1e6} onChange={v => { setInput(x => ({ ...x, trades: x.trades.map((a, j) => j === i ? { ...a, strike: v } : a) })); setResult(null) }} />
          <button type="button" aria-label={`Remove trade ${i + 1}`} disabled={input.trades.length === 1} onClick={() => { setInput(x => ({ ...x, trades: x.trades.filter((_, j) => j !== i) })); setResult(null) }}>×</button>
        </div>)}
        <button type="button" disabled={input.trades.length >= 100} onClick={() => { setInput(x => ({ ...x, trades: [...x.trades, { quantity: -500, strike: 100 }] })); setResult(null) }}>Add forward</button>
        <button className="primary" disabled={busy}>{busy ? 'Simulating…' : 'Calculate exposure & risk'}</button>
      </fieldset>{error && <p role="alert" className="error">{error}</p>}
    </form><section className="results" aria-busy={busy}>
      {result && snapshot ? <>
        {result.paths * (1 - result.confidence) < 20 && <p className="risk-note">Fewer than 20 paths fall in the requested tail. Increase paths or reduce confidence for a less sparse estimate.</p>}
        <section className="metrics">
          <Metric title="Peak PFE" value={result.peakPfe} note={`${result.confidence * 100}% exposure percentile, Q measure`} />
          <Metric title="CVA" value={result.cva} note="Discounted expected counterparty-default loss" />
          <Metric title="Clean value" value={result.cleanValue} note="Before counterparty credit adjustment" />
          <Metric title="CVA-adjusted value" value={result.adjustedValue} note="Clean value − unilateral CVA" />
          <Metric title="Market VaR" value={result.var} note={`${result.horizonDays}-day loss percentile, physical measure`} />
          <Metric title="Expected shortfall" value={result.expectedShortfall} note="Average loss over the worst tail probability" />
        </section><ExposureChart result={result} />
        <details className="panel risk-detail"><summary>Exposure profile values</summary><div className="risk-scroll"><table><thead><tr><th>Years</th><th>Expected exposure</th><th>PFE</th></tr></thead><tbody>{result.profile.map(p => <tr key={p.time}><td>{fmt(p.time)}</td><td>{fmt(p.expectedExposure)}</td><td>{fmt(p.pfe)}</td></tr>)}</tbody></table></div></details>
        <section className="panel risk-detail"><h2>Export this run</h2><div className="risk-grid">{Object.entries(metadata).map(([key, value]) => <label className="risk-field" key={key}>{key}<input type={key === 'asOf' ? 'date' : 'text'} value={value} onChange={e => setMetadata(x => ({ ...x, [key]: e.target.value }))} /></label>)}</div><p className="risk-note">Currency labels the input units; no FX conversion. The as-of date labels the input snapshot. CSV carries the model version and a hash of all calculation inputs.</p><div className="risk-actions"><button onClick={() => void exportExposure()}>Export engine exposures CSV</button><button onClick={() => downloadFile('risk-run.json', JSON.stringify({ input: snapshot, metadata, result }, null, 2), 'application/json')}>Save inputs & results</button></div></section>
        <section className="panel risk-detail"><h2>How to read this run</h2><p>PFE is a percentile of positive exposure at each future date, not a default loss or maximum possible exposure. EE is average positive exposure. CVA weights EE by loss given default and marginal default probabilities.</p><p>VaR is a percentile of losses over the selected horizon, not a worst-case limit. Losses can exceed it. Negative VaR means even the selected loss percentile is a gain.</p><p>Flat rates, GBM, fixed collateral, independent default and no wrong-way risk. Final exposure is immediately before settlement; afterwards it is zero. CVA uses right-endpoint time buckets. No regulatory capital calculation.</p><small>{result.paths.toLocaleString()} paths · seed {result.seed} · {result.modelVersion}. Seed repeatability is within the same native build; normal generators can differ across platforms.</small></section>
      </> : <div className="panel empty"><p>{busy ? 'Running the native simulation…' : 'Set your portfolio and calculate to see future exposure and market risk.'}</p></div>}
    </section></div>
  </>
}
function ExposureChart({ result }: { result: RiskResult }) {
  const width = 720, height = 260, left = 82, top = 20, bottom = 40, right = 24
  const max = Math.max(1, ...result.profile.flatMap(p => [p.pfe, p.expectedExposure]))
  const tmax = result.profile[result.profile.length - 1].time
  const x = (t: number) => left + t / tmax * (width - left - right)
  const y = (v: number) => height - bottom - v / max * (height - top - bottom)
  const path = (key: 'pfe' | 'expectedExposure') => result.profile.map(p => `${x(p.time)},${y(p[key])}`).join(' ')
  return <section className="panel risk-detail"><h2>Future exposure profile</h2><p><span className="risk-pfe">● PFE ({result.confidence * 100}%)</span> · <span className="risk-ee">● Expected exposure</span> · currency units</p><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="PFE and expected exposure over years; exact data in exposure profile values">
    {[0, .5, 1].map(f => <g key={f}><line x1={left} x2={width - right} y1={y(f * max)} y2={y(f * max)} stroke="#26353c" /><text x={left - 8} y={y(f * max) + 4} textAnchor="end">{fmt(f * max)}</text></g>)}
    <polyline fill="none" stroke="#c5a0ff" strokeWidth={3} points={path('pfe')} /><polyline fill="none" stroke="#67d7ff" strokeWidth={3} points={path('expectedExposure')} />
    {[0, .5, 1].map(f => <text key={f} x={x(tmax * f)} y={height - 12} textAnchor="middle">{fmt(tmax * f)}y</text>)}
  </svg></section>
}
function CreditPanel() {
  const initial: CreditInput = { face: 1000, coupon: .05, maturity: 5, frequency: 2, rate: .03, hazardRate: .02, recovery: .4 }
  const [input, setInput] = useState(initial); const [result, setResult] = useState<CreditResult | null>(null)
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const specs: FieldSpec<CreditInput>[] = [['face', 'Face value', 1, .01, 1e12], ['coupon', 'Coupon (%)', 100, 0, 100], ['maturity', 'Maturity (years)', 1, .01, 30], ['frequency', 'Payments/year (1, 2, 4, 12)', 1, 1, 12, 1], ['rate', 'Risk-free rate (%)', 100, -10, 50], ['hazardRate', 'Q hazard rate (% per year)', 100, 0, 500], ['recovery', 'Recovery of par (%)', 100, 0, 100]]
  async function run(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); setResult(null); try { setResult(await postRisk<CreditResult>('credit-bond', input)) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <><p className="risk-note">Defaultable fixed-coupon bond: survival-weighted payments plus recovery of par at default. Flat continuously compounded risk-free rate and risk-neutral hazard rate. Valued on a coupon date with no accrued interest.</p><form className="panel risk-detail" onSubmit={run}><fieldset disabled={busy}><div className="risk-grid">{specs.map(([key, label, scale, min, max, step]) => <Numeric key={key} label={label} value={input[key] * scale} min={min} max={max} step={step} onChange={v => { setInput(x => ({ ...x, [key]: v / scale })); setResult(null) }} />)}</div><button className="primary" disabled={busy}>{busy ? 'Pricing…' : 'Price credit bond'}</button></fieldset>{error && <p className="error" role="alert">{error}</p>}</form>{result && <section className="metrics"><Metric title="Risk-free price" value={result.riskFreePrice} note="Cash flows discounted without default" /><Metric title="Credit-risky price" value={result.riskyPrice} note="Surviving payments + expected recovery" /><Metric title="Credit adjustment" value={result.creditAdjustment} note="Risk-free price − credit-risky price" /><Metric title="Cumulative default probability (%)" value={result.defaultProbability * 100} note="1 − exp(−hazard × maturity)" /></section>}</>
}
function HistoricalPanel() {
  const [text, setText] = useState('120, -80, 40, -250, 90, -150, 60, -30, 100, -400, 70, -90, 50, -180, 110, -60, 30, -220, 80, -500')
  const [confidence, setConfidence] = useState(95); const [days, setDays] = useState(1)
  const [result, setResult] = useState<HistoricalResult | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function run(e: FormEvent) {
    e.preventDefault(); setBusy(true); setResult(null); setError('')
    try {
      const tokens = text.trim().split(/[\s,;]+/)
      if (!text.trim() || tokens.some(t => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(t) || !Number.isFinite(Number(t)))) throw new Error('Enter finite numeric P&L observations separated by commas or whitespace.')
      setResult(await postRisk<HistoricalResult>('historical-var', { confidence: confidence / 100, horizonDays: days, pnl: tokens.map(Number) }))
    } catch (e) { setError(message(e)) } finally { setBusy(false) }
  }
  return <><p className="risk-note">Paste historical scenario P&Ls for the same portfolio, currency and horizon. Positive = profit; negative = loss. The sample is illustrative. The engine applies no square-root-of-time scaling and does not revalue trades from raw prices.</p><form className="panel risk-detail" onSubmit={run}><fieldset disabled={busy}><div className="risk-grid"><Numeric label="Confidence (%)" value={confidence} min={50} max={99.99} onChange={v => { setConfidence(v); setResult(null) }} /><Numeric label="Horizon of supplied P&Ls (days)" value={days} min={1} max={252} step={1} onChange={v => { setDays(v); setResult(null) }} /></div><label className="risk-field">P&L observations<textarea rows={6} value={text} onChange={e => { setText(e.target.value); setResult(null) }} /></label><button className="primary" disabled={busy}>{busy ? 'Calculating…' : 'Calculate historical VaR'}</button></fieldset>{error && <p role="alert" className="error">{error}</p>}</form>{result && <><section className="metrics"><Metric title={`${days}-day VaR`} value={result.var} note="Nearest-rank percentile of losses" /><Metric title="Expected shortfall" value={result.expectedShortfall} note="Worst tail average with fractional boundary weight" /><Metric title="Observations" value={result.observations} note={`${confidence}% confidence`} /></section>{result.observations * (1 - confidence / 100) < 20 && <p className="risk-note">Fewer than 20 observations fall in the requested tail. This is a sparse estimate; use a larger representative history.</p>}</>}</>
}
function ReconciliationPanel() {
  const [engine, setEngine] = useState<ExposureRow[]>([]); const [reporting, setReporting] = useState<ExposureRow[]>([])
  const [absolute, setAbsolute] = useState(.01); const [relative, setRelative] = useState(.1)
  const [result, setResult] = useState<ReconResult | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [fileVersion, setFileVersion] = useState(0)
  async function upload(file: File | undefined, side: 'engine' | 'reporting') {
    if (!file) return
    setReading(true); setResult(null); setError(''); (side === 'engine' ? setEngine : setReporting)([])
    try { if (file.size > 10 * 1024 * 1024) throw new Error('Maximum file size is 10 MB.'); const rows = parseExposures(await file.text()); (side === 'engine' ? setEngine : setReporting)(rows) } catch (e) { setError(message(e)) } finally { setReading(false) }
  }
  function sample() {
    const base: ExposureRow = { tradeId: 'NETTING-SET', counterparty: 'DEMO-CP', nettingSet: 'NS-001', asOf: '2026-09-19', currency: 'USD', metric: 'PFE', tenor: 1, confidence: .95, modelVersion: 'demo-v1', scenarioId: 'sample-snapshot', value: 10000 }
    const a = [base, { ...base, tenor: 2, value: 12000 }, { ...base, tenor: 3, value: 15000 }, { ...base, tenor: 4, value: 16000 }, { ...base, tenor: 5, value: 18000 }]
    const b = [{ ...base, value: 10000.005 }, { ...base, tenor: 2, value: 12300 }, { ...base, tenor: 4, currency: 'EUR', value: 16000 }, { ...base, tenor: 5, value: 18000 }, { ...base, tenor: 5, value: 18000 }, { ...base, tenor: 6, value: 20000 }]
    setEngine(a); setReporting(b); setResult(null); setError(''); setFileVersion(v => v + 1)
  }
  async function run(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); setResult(null); try { setResult(await postRisk<ReconResult>('reconcile', { engine, reporting, absoluteTolerance: absolute, relativeTolerance: relative / 100 })) } catch (e) { setError(message(e)) } finally { setBusy(false) } }
  return <><p className="risk-note">Match by trade ID, counterparty, netting set, metric and tenor. Dates, currency, confidence, model and scenario snapshot must agree before values can be compared. Identifiers are case-sensitive. Duplicate keys are flagged, never summed.</p>
    <form className="panel risk-detail" onSubmit={run}><fieldset disabled={busy || reading}><div className="risk-actions"><button type="button" onClick={sample}>Load illustrative breaks</button><button type="button" onClick={() => downloadFile('exposure-template.csv', exposureCsv([]))}>Download CSV header</button></div><div className="risk-grid"><label className="risk-field">Engine exposures CSV ({engine.length} rows)<input key={fileVersion} type="file" accept=".csv,text/csv" onChange={e => void upload(e.target.files?.[0], 'engine')} /></label><label className="risk-field">Reporting exposures CSV ({reporting.length} rows)<input key={fileVersion} type="file" accept=".csv,text/csv" onChange={e => void upload(e.target.files?.[0], 'reporting')} /></label><Numeric label="Absolute tolerance (currency units)" value={absolute} min={0} max={1e12} onChange={v => { setAbsolute(v); setResult(null) }} /><Numeric label="Relative tolerance (%)" value={relative} min={0} max={100} onChange={v => { setRelative(v); setResult(null) }} /></div><p className="risk-note">Allowed difference = max(absolute tolerance, relative tolerance × |engine value|). Difference = reporting − engine. Missing records are never treated as zero exposure.</p><button className="primary" disabled={busy || reading || (!engine.length && !reporting.length)}>{busy ? 'Reconciling…' : reading ? 'Reading CSV…' : 'Reconcile exposures'}</button></fieldset>{error && <p role="alert" className="error">{error}</p>}</form>
    {result && <><section className="metrics"><Metric title="Matched keys" value={result.matched} note="Within tolerance and context agrees" /><Metric title="Breaks" value={result.breaks} note="Missing, duplicate, context or value mismatch" /><Metric title="Engine rows" value={result.engineCount} note={`${result.reportingCount} reporting rows`} /></section><section className="panel risk-detail"><div className="panel-heading"><h2>Reconciliation results</h2><button onClick={() => downloadFile('reconciliation-results.json', JSON.stringify(result, null, 2), 'application/json')}>Export full report</button></div><p>Completed {new Date(result.reconciledAt).toLocaleString()}. Full export retains every source row and tolerance.</p><div className="risk-scroll"><table><thead><tr><th>Key</th><th>Status / reason</th><th>Engine</th><th>Reporting</th><th>Difference</th><th>Tolerance</th></tr></thead><tbody>{result.rows.slice(0, 500).map((row, i) => <tr key={i}><td>{row.key.counterparty} / {row.key.nettingSet}<br />{row.key.tradeId} · {row.key.metric} · {row.key.tenor}y</td><td><strong className={row.status === 'matched' ? 'risk-ee' : 'risk-break'}>{row.status}</strong><br />{row.reasons.join('; ')}</td><td>{row.engineRows.map(r => `${fmt(r.value)} ${r.currency}`).join('; ') || '—'}</td><td>{row.reportingRows.map(r => `${fmt(r.value)} ${r.currency}`).join('; ') || '—'}</td><td>{row.difference === null ? '—' : fmt(row.difference)}</td><td>{row.allowedDifference === null ? '—' : fmt(row.allowedDifference)}</td></tr>)}</tbody></table></div>{result.rows.length > 500 && <p>Showing 500 keys. Export includes all {result.rows.length}.</p>}</section></>}
  </>
}
