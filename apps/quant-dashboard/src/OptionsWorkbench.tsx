import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { analyseOption } from './api'
import type { OptionAnalysisRequest, OptionAnalysisResponse } from './types'
import { TermHelp } from './TermHelp'
import './OptionsWorkbench.css'

const defaults: OptionAnalysisRequest = {
  optionType: 'Call', spot: 100, strike: 100, riskFreeRate: .05,
  volatility: .20, timeToExpiry: 1, marketPrice: 10.4506,
}
const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 })
const signed = (value: number) => `${value > 0 ? '+' : ''}${fmt.format(value)}`

export function OptionsWorkbench() {
  const [input, setInput] = useState(defaults)
  const [result, setResult] = useState<OptionAnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function run(value: OptionAnalysisRequest) {
    setLoading(true); setError(null)
    try { setResult(await analyseOption(value)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The calculation failed.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void run(defaults) }, [])
  const change = <K extends keyof OptionAnalysisRequest>(key: K, value: OptionAnalysisRequest[K]) =>
    setInput(current => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => { event.preventDefault(); void run(input) }

  return <>
    <section className="intro"><div><p className="eyebrow">DERIVATIVES LAB</p><h1>Options Workbench</h1></div><p>Price a European option in the C++ Black-Scholes engine and explore its Greeks, payoff and volatility exposure.</p></section>
    <div className="workspace">
      <form className="panel controls" onSubmit={submit}>
        <div className="panel-heading"><h2>Contract</h2><button type="button" className="text-button" onClick={() => { setInput(defaults); void run(defaults) }}>Reset</button></div>
        <label className="field"><span><TermHelp term="Option type" /><small>right to buy / sell</small></span><select value={input.optionType} onChange={event => change('optionType', event.target.value as 'Call' | 'Put')}><option>Call</option><option>Put</option></select></label>
        <OptionField label="Spot price" hint="underlying today" value={input.spot} min={.01} step={0.01} onChange={value => change('spot', value)} />
        <OptionField label="Strike price" hint="exercise price" value={input.strike} min={.01} step={0.01} onChange={value => change('strike', value)} />
        <OptionField label="Risk-free rate" hint="% annually" value={input.riskFreeRate * 100} min={-50} max={100} step={.001} onChange={value => change('riskFreeRate', value / 100)} />
        <OptionField label="Volatility" hint="% annually" value={input.volatility * 100} min={.01} max={500} step={0.01} onChange={value => change('volatility', value / 100)} />
        <OptionField label="Time to expiry" hint="years" value={input.timeToExpiry} min={.01} max={100} step={.01} onChange={value => change('timeToExpiry', value)} />
        <OptionField label="Market price" hint="for implied vol" value={input.marketPrice} min={.0001} step={.0001} onChange={value => change('marketPrice', value)} />
        <button className="primary" disabled={loading}>{loading ? 'Calculating…' : 'Run analysis'} <span>→</span></button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      <section className={`results ${loading ? 'loading' : ''}`} aria-busy={loading}>
        {result ? <OptionDashboard result={result} /> : <div className="panel empty"><i /><p>Running the native option model…</p></div>}
      </section>
    </div>
  </>
}

type FieldProps = { label: string; hint: string; value: number; min: number; max?: number; step: number; onChange: (value: number) => void }
function OptionField({ label, hint, value, min, max, step, onChange }: FieldProps) {
  return <label className="field"><span><TermHelp term={label} /><small>{hint}</small></span><input aria-label={label} type="number" required value={value} min={min} max={max} step={step} onChange={event => onChange(event.target.valueAsNumber)} /></label>
}

function OptionDashboard({ result }: { result: OptionAnalysisResponse }) {
  const m = result.metrics
  return <>
    <section className="metrics option-metrics">
      <OptionMetric label="Model price" value={fmt.format(m.modelPrice)} note="Black-Scholes fair value" />
      <OptionMetric label="Implied volatility" value={`${fmt.format(m.impliedVolatility * 100)}%`} note="volatility backed out from market price" />
      <OptionMetric label="Delta" value={fmt.format(m.delta)} note="value change for a 1-unit spot move" />
      <OptionMetric label="Gamma" value={fmt.format(m.gamma)} note="change in Delta for a 1-unit spot move" />
      <OptionMetric label="Vega" value={fmt.format(m.vegaPerPercentagePoint)} note="value change for +1 volatility point" />
      <OptionMetric label="Theta" value={fmt.format(m.thetaPerDay)} note="estimated value change per day" />
      <OptionMetric label="Rho" value={fmt.format(m.rhoPerPercentagePoint)} note="value change for +1 rate point" />
    </section>
    <SpotChart result={result} />
    <VolatilityTable result={result} />
  </>
}

function OptionMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="metric"><div className="metric-label"><TermHelp term={label} /></div><strong>{value}</strong><small>{note}</small></article>
}

function SpotChart({ result }: { result: OptionAnalysisResponse }) {
  const g = useMemo(() => {
    const width=860,height=270,left=58,right=22,top=18,bottom=42, rows=result.spotScenarios
    const minX=Math.min(...rows.map(x=>x.spot)),maxX=Math.max(...rows.map(x=>x.spot))
    const maxY=Math.max(...rows.flatMap(x=>[x.modelPrice,x.payoffAtExpiry]),1)
    const x=(v:number)=>left+(v-minX)/(maxX-minX||1)*(width-left-right)
    const y=(v:number)=>top+(maxY-v)/maxY*(height-top-bottom)
    const prices=rows.map(s=>`${x(s.spot)},${y(s.modelPrice)}`).join(' ')
    const payoffs=rows.map(s=>`${x(s.spot)},${y(s.payoffAtExpiry)}`).join(' ')
    return {width,height,left,right,top,bottom,maxY,x,y,prices,payoffs}
  },[result])
  return <section className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">SPOT SCENARIOS</p><h2><TermHelp term="Option value profile" /></h2></div><div className="dual-legend"><span><i className="blue-dot"/>Today</span><span><i className="green-dot"/>At expiry</span></div></div><div className="chart"><svg viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label="Option value and expiry payoff by underlying price"><line className="axis" x1={g.left} y1={g.height-g.bottom} x2={g.width-g.right} y2={g.height-g.bottom}/><polyline className="line" points={g.prices}/><polyline className="payoff-line" points={g.payoffs}/>{result.spotScenarios.map(s=><g key={s.spot}><circle className="point" cx={g.x(s.spot)} cy={g.y(s.modelPrice)} r="4"><title>{`Spot ${fmt.format(s.spot)}: value ${fmt.format(s.modelPrice)}`}</title></circle><text x={g.x(s.spot)} y={g.height-14} textAnchor="middle">{fmt.format(s.spot)}</text></g>)}<text x={g.left-10} y={g.top+5} textAnchor="end">{fmt.format(g.maxY)}</text><text x={g.width/2} y={g.height} textAnchor="middle">Underlying spot price</text></svg></div><p className="note">Today’s option value includes time value. The expiry line shows intrinsic payoff when no time remains.</p></section>
}

function VolatilityTable({ result }: { result: OptionAnalysisResponse }) {
  return <section className="panel table-panel"><div className="panel-heading"><div><p className="eyebrow">VOLATILITY SCENARIOS</p><h2><TermHelp term="Volatility exposure" /></h2></div></div><div className="table-scroll"><table><thead><tr><th>Volatility</th><th>Model price</th><th>P&amp;L vs current model</th></tr></thead><tbody>{result.volatilityScenarios.map(s=><tr key={s.volatility}><td>{fmt.format(s.volatility*100)}%</td><td>{fmt.format(s.modelPrice)}</td><td className={s.pnl>=0?'positive':'negative'}>{signed(s.pnl)}</td></tr>)}</tbody></table></div></section>
}
