import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { analyseBond } from './api'
import type { BondAnalysisRequest, BondAnalysisResponse, RateScenario } from './types'
import './App.css'
import { TermHelp } from './TermHelp'

const defaults: BondAnalysisRequest = {
  faceValue: 1000, couponRate: .05, maturityYears: 5, paymentsPerYear: 2,
  yield: .045, shocksBasisPoints: [-100, -50, -25, 0, 25, 50, 100],
}
const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 })
const signed = (value: number) => `${value > 0 ? '+' : ''}${fmt.format(value)}`

export default function App() {
  const [input, setInput] = useState(defaults)
  const [result, setResult] = useState<BondAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function run(value: BondAnalysisRequest) {
    setLoading(true); setError(null)
    try { setResult(await analyseBond(value)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The calculation failed.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    analyseBond(defaults)
      .then(setResult)
      .catch(reason => setError(reason instanceof Error ? reason.message : 'The calculation failed.'))
      .finally(() => setLoading(false))
  }, [])
  const change = (key: keyof BondAnalysisRequest, value: number) => setInput(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => { event.preventDefault(); void run(input) }

  return <div className="shell">
    <Header />
    <main>
      <section className="intro"><div><p className="eyebrow">FIXED INCOME LAB</p><h1>Bond Risk Workbench</h1></div><p>Price a fixed-rate bond in the C++ engine and explore how its value responds to parallel yield shocks.</p></section>
      <div className="workspace">
        <form className="panel controls" onSubmit={submit}>
          <div className="panel-heading"><h2>Instrument</h2><button type="button" className="text-button" onClick={() => { setInput(defaults); void run(defaults) }}>Reset</button></div>
          <Field label="Face value" hint="currency units" value={input.faceValue} min={1} step={100} onChange={value => change('faceValue', value)} />
          <Field label="Coupon rate" hint="% annually" value={input.couponRate * 100} min={0} max={100} step={.1} onChange={value => change('couponRate', value / 100)} />
          <Field label="Maturity" hint="years" value={input.maturityYears} min={.1} max={100} step={.5} onChange={value => change('maturityYears', value)} />
          <div className="field"><div className="field-heading"><TermHelp term="Coupon frequency" /><small>payments / year</small></div><select aria-label="Coupon frequency" value={input.paymentsPerYear} onChange={event => change('paymentsPerYear', +event.target.value)}><option value="1">Annual</option><option value="2">Semi-annual</option><option value="4">Quarterly</option><option value="12">Monthly</option></select></div>
          <Field label="Market yield" hint="% annually" value={input.yield * 100} min={-99} max={100} step={.1} onChange={value => change('yield', value / 100)} />
          <button className="primary" disabled={loading}>{loading ? 'Calculating…' : 'Run analysis'} <span>→</span></button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
        <section className={`results ${loading ? 'loading' : ''}`} aria-busy={loading}>
          {result ? <Dashboard result={result} /> : <div className="panel empty"><i /><p>Running the native pricing model…</p></div>}
        </section>
      </div>
    </main>
  </div>
}

function Header() {
  return <header className="topbar"><div className="brand"><b>Q</b><strong>QuantEngine</strong></div><nav><span className="active">Bond risk</span><span>Options</span><span>Portfolio</span></nav><div className="engine"><i /> C++ engine via .NET 8</div></header>
}

type FieldProps = { label: string; hint: string; value: number; min: number; max?: number; step: number; onChange: (value: number) => void }
function Field({ label, hint, value, min, max, step, onChange }: FieldProps) {
  return <div className="field"><div className="field-heading"><TermHelp term={label} /><small>{hint}</small></div><input aria-label={label} type="number" required value={value} min={min} max={max} step={step} onChange={event => onChange(event.target.valueAsNumber)} /></div>
}

function Dashboard({ result }: { result: BondAnalysisResponse }) {
  const m = result.metrics
  return <>
    <section className="metrics">
      <Metric label="Present value" value={fmt.format(m.presentValue)} note="cash flows discounted today" />
      <Metric label="Modified duration" value={fmt.format(m.modifiedDuration)} note="price sensitivity to yield" />
      <Metric label="DV01" value={fmt.format(m.dv01)} note="value change for 1 bp" />
      <Metric label="Convexity" value={fmt.format(m.convexity)} note="curvature of price response" />
      <Metric label="Macaulay duration" value={`${fmt.format(m.macaulayDuration)}y`} note="weighted cash-flow timing" />
    </section>
    <Chart scenarios={result.scenarios} />
    <ScenarioTable scenarios={result.scenarios} />
    <Cashflows result={result} />
  </>
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="metric"><div className="metric-label"><TermHelp term={label} /></div><strong>{value}</strong><small>{note}</small></article>
}

function Chart({ scenarios }: { scenarios: RateScenario[] }) {
  const g = useMemo(() => {
    const width = 860, height = 270, left = 58, right = 22, top = 18, bottom = 42
    const ys = scenarios.map(x => x.exactPnl), xs = scenarios.map(x => x.shockBasisPoints)
    const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys), minX = Math.min(...xs), maxX = Math.max(...xs)
    const x = (v: number) => left + (v - minX) / (maxX - minX || 1) * (width - left - right)
    const y = (v: number) => top + (maxY - v) / (maxY - minY || 1) * (height - top - bottom)
    return { width, height, left, right, top, bottom, minY, maxY, x, y, zero: y(0), points: scenarios.map(s => `${x(s.shockBasisPoints)},${y(s.exactPnl)}`).join(' ') }
  }, [scenarios])
  return <section className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">SCENARIO P&amp;L</p><h2><TermHelp term="Yield shock profile" /></h2></div><div className="legend"><i /> Exact revaluation</div></div><div className="chart"><svg viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label="Profit and loss by yield shock"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#67d7ff" stopOpacity=".3"/><stop offset="1" stopColor="#67d7ff" stopOpacity="0"/></linearGradient></defs><line className="axis" x1={g.left} y1={g.zero} x2={g.width-g.right} y2={g.zero}/><polygon className="area" points={`${g.x(scenarios[0].shockBasisPoints)},${g.zero} ${g.points} ${g.x(scenarios.at(-1)!.shockBasisPoints)},${g.zero}`}/><polyline className="line" points={g.points}/>{scenarios.map(s => <g key={s.shockBasisPoints}><circle className="point" cx={g.x(s.shockBasisPoints)} cy={g.y(s.exactPnl)} r="4"><title>{`${s.shockBasisPoints} bp: ${fmt.format(s.exactPnl)}`}</title></circle><text x={g.x(s.shockBasisPoints)} y={g.height-14} textAnchor="middle">{s.shockBasisPoints}</text></g>)}<text x={g.left-10} y={g.top+5} textAnchor="end">{fmt.format(g.maxY)}</text><text x={g.left-10} y={g.height-g.bottom} textAnchor="end">{fmt.format(g.minY)}</text><text x={g.width/2} y={g.height} textAnchor="middle">Yield shock (basis points)</text></svg></div><p className="note">Bond prices generally move inversely to yields. Convexity makes the relationship curved rather than linear.</p></section>
}

function ScenarioTable({ scenarios }: { scenarios: RateScenario[] }) {
  return <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">MODEL COMPARISON</p><h2>Scenario details</h2></div></div><div className="table-scroll"><table><thead><tr><th><TermHelp term="Shock" /></th><th><TermHelp term="Shocked yield" /></th><th><TermHelp term="Price" /></th><th><TermHelp term="Exact P&L" /></th><th><TermHelp term="Duration" /></th><th><TermHelp term="Duration + convexity" /></th></tr></thead><tbody>{scenarios.map(s => <tr key={s.shockBasisPoints}><td>{signed(s.shockBasisPoints)} bp</td><td>{fmt.format(s.shockedYield*100)}%</td><td>{fmt.format(s.shockedPrice)}</td><td className={s.exactPnl >= 0 ? 'positive' : 'negative'}>{signed(s.exactPnl)}</td><td>{fmt.format(s.durationPnl)}</td><td>{fmt.format(s.durationConvexityPnl)}</td></tr>)}</tbody></table></div></section>
}

function Cashflows({ result }: { result: BondAnalysisResponse }) {
  const max = Math.max(...result.cashflows.map(x => x.amount))
  return <section className="panel cashflow-panel"><div className="panel-heading"><div><p className="eyebrow">PAYMENT SCHEDULE</p><h2><TermHelp term="Contractual cash flows" /></h2></div><span className="muted">{result.cashflows.length} payments</span></div><div className="cashflow-bars">{result.cashflows.map(x => <div className="cashflow" key={x.timeYears} title={`Year ${x.timeYears}: ${fmt.format(x.amount)}`}><i style={{height:`${Math.max(8,x.amount/max*100)}%`}}/><small>{x.timeYears}y</small></div>)}</div></section>
}
