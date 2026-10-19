import { useState } from 'react'
import type { FormEvent } from 'react'
import { analyseEquity } from './api'
import './EquityWorkbench.css'

type Factor = { value: number | null; unavailableReason: string | null }
type Statement = { periodStart: string; periodEnd: string; publishedOn: string; values: Record<string, string> }
type Analyst = { analyst: string; observedOn: string; eps: string; priceTarget: string }
type Snapshot = { observedOn: string; estimates: Analyst[] }
type Consensus = { analystCount: number; meanEps: number; medianEps: number; populationStandardDeviation: number;
  relativeDispersion: Factor; meanPriceTarget: number | null; priceTargetCount: number }
type FundamentalsResult = { symbol: string; currency: string; asOf: string; periodStart: string; periodEnd: string;
  publishedOn: string; factors: Record<string, Factor> }
type ExpectationsResult = { symbol: string; currency: string; asOf: string; fiscalPeriodEnd: string;
  currentObservedOn: string; current: Consensus; previous: Consensus | null;
  epsRevision: Factor; earningsSurprise: Factor; targetUpside: Factor }
type Mode = 'fundamentals' | 'expectations'

const fields = [
  ['revenue', 'Revenue'], ['grossProfit', 'Gross profit'], ['operatingIncome', 'Operating income'],
  ['netIncome', 'Net income'], ['operatingCashFlow', 'Operating cash flow'], ['capitalExpenditure', 'Capital expenditure'],
  ['totalAssets', 'Total assets'], ['totalEquity', 'Total equity'], ['totalDebt', 'Total debt'], ['cash', 'Cash'],
  ['currentAssets', 'Current assets'], ['currentLiabilities', 'Current liabilities'], ['dilutedShares', 'Diluted weighted-average shares'],
] as const
const labels: Record<string, string> = {
  grossMargin: 'Gross margin', operatingMargin: 'Operating margin', netMargin: 'Net margin', cashFlowMargin: 'Cash flow margin',
  freeCashFlow: 'Free cash flow', freeCashFlowMargin: 'Free cash flow margin', returnOnEndingAssets: 'Return on ending assets',
  returnOnEndingEquity: 'Return on ending equity', debtToEquity: 'Debt / equity', currentRatio: 'Current ratio', netDebt: 'Net debt',
  dilutedEps: 'Diluted EPS', earningsYield: 'Earnings yield', freeCashFlowYield: 'Free cash flow yield',
  revenueGrowthYoY: 'Revenue growth YoY', netIncomeGrowthYoY: 'Net income growth YoY',
}
const percentages = new Set(['grossMargin', 'operatingMargin', 'netMargin', 'cashFlowMargin', 'freeCashFlowMargin',
  'returnOnEndingAssets', 'returnOnEndingEquity', 'earningsYield', 'freeCashFlowYield', 'revenueGrowthYoY', 'netIncomeGrowthYoY'])
const fmt = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 })
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 2 })
const sampleStatement = (): Statement => ({ periodStart: '2025-01-01', periodEnd: '2025-12-31', publishedOn: '2026-02-01',
  values: { revenue: '200', grossProfit: '100', operatingIncome: '50', netIncome: '20', operatingCashFlow: '40',
    capitalExpenditure: '10', totalAssets: '400', totalEquity: '100', totalDebt: '60', cash: '80',
    currentAssets: '90', currentLiabilities: '30', dilutedShares: '10' } })
const samplePrior = (): Statement => ({ ...sampleStatement(), periodStart: '2024-01-01', periodEnd: '2024-12-31',
  publishedOn: '2025-02-01', values: { ...sampleStatement().values, revenue: '100', netIncome: '-10' } })
const sampleSnapshot = (): Snapshot => ({ observedOn: '2026-01-31', estimates: [
  { analyst: 'Analyst A', observedOn: '2026-01-30', eps: '1', priceTarget: '100' },
  { analyst: 'Analyst B', observedOn: '2026-01-31', eps: '3', priceTarget: '140' },
] })
const samplePrevious = (): Snapshot => ({ observedOn: '2026-01-01', estimates: [
  { analyst: 'Analyst A', observedOn: '2026-01-01', eps: '1', priceTarget: '' },
] })
function number(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 1e24) throw new Error('Enter finite numbers with magnitude no larger than 1e24.')
  return parsed
}
function snapshotPayload(snapshot: Snapshot) {
  return { observedOn: snapshot.observedOn, estimates: snapshot.estimates.map(e => {
    const eps = number(e.eps)
    if (eps === null) throw new Error('Enter EPS for every analyst. Zero is allowed.')
    return { analyst: e.analyst.trim(), observedOn: e.observedOn, eps, priceTarget: number(e.priceTarget) }
  }) }
}

export function EquityWorkbench({ mode }: { mode: Mode }) {
  const [symbol, setSymbol] = useState('TEST'), [currency, setCurrency] = useState('USD')
  const [asOf, setAsOf] = useState('2026-03-01'), [marketCap, setMarketCap] = useState('500')
  const [statement, setStatement] = useState(sampleStatement), [prior, setPrior] = useState(samplePrior)
  const [usePrior, setUsePrior] = useState(false)
  const [current, setCurrent] = useState(sampleSnapshot), [previous, setPrevious] = useState(samplePrevious)
  const [usePrevious, setUsePrevious] = useState(false), [useActual, setUseActual] = useState(false)
  const [periodEnd, setPeriodEnd] = useState('2025-12-31'), [published, setPublished] = useState('2026-02-01')
  const [actualEps, setActualEps] = useState('2.5'), [spot, setSpot] = useState('100')
  const [result, setResult] = useState<FundamentalsResult | ExpectationsResult | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [edited, setEdited] = useState(false)
  function reset() {
    setSymbol('TEST'); setCurrency('USD'); setAsOf('2026-03-01'); setMarketCap('500'); setStatement(sampleStatement())
    setPrior(samplePrior()); setUsePrior(false); setCurrent(sampleSnapshot()); setPrevious(samplePrevious()); setUsePrevious(false)
    setUseActual(false); setPeriodEnd('2025-12-31'); setPublished('2026-02-01'); setActualEps('2.5'); setSpot('100')
    setResult(null); setError(''); setEdited(false)
  }
  async function run(event: FormEvent) {
    event.preventDefault(); setLoading(true); setResult(null); setError('')
    try {
      const identity = { symbol: symbol.trim().toUpperCase(), currency: currency.trim().toUpperCase() }
      const statementPayload = (s: Statement) => ({ ...identity, periodStart: s.periodStart, periodEnd: s.periodEnd,
        publishedOn: s.publishedOn, ...Object.fromEntries(fields.map(([key]) => [key, number(s.values[key] ?? '')])) })
      if (mode === 'fundamentals') {
        setResult(await analyseEquity<FundamentalsResult>('/api/fundamentals/analyse', { asOf, current: statementPayload(statement),
          priorYear: usePrior ? statementPayload(prior) : null, marketCapitalization: number(marketCap) }))
      } else {
        if (useActual && number(actualEps) === null) throw new Error('Enter actual EPS or turn off reported earnings.')
        setResult(await analyseEquity<ExpectationsResult>('/api/investor-expectations/analyse', { ...identity, asOf,
          fiscalPeriodEnd: periodEnd, current: snapshotPayload(current), previous: usePrevious ? snapshotPayload(previous) : null,
          actual: useActual ? { publishedOn: published, eps: number(actualEps) } : null, spotPrice: number(spot) }))
      }
      setEdited(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Analysis failed. Please retry.') }
    finally { setLoading(false) }
  }
  return <div className="equity-workbench">
    <section className="intro"><div><p className="eyebrow">EQUITY RESEARCH</p><h1>{mode === 'fundamentals' ? 'Fundamentals' : 'Investor Expectations'}</h1></div>
      <p>{mode === 'fundamentals' ? 'Explore company profitability, cash flow, leverage and valuation from financial statements.' : 'Compare analyst estimates, earnings revisions, reported results and price targets.'}</p></section>
    <p className="equity-notice">Sample data is prefilled. Enter your own figures to analyse a company. Company statements and analyst estimates are not downloaded automatically.</p>
    <div className="equity-layout">
      <form className="panel equity-form" onSubmit={run} onChange={() => setEdited(true)}>
        <fieldset disabled={loading}>
          <div className="panel-heading"><h2>Analysis inputs</h2><button type="button" className="text-button" onClick={reset}>Load sample / reset</button></div>
          <div className="equity-fields">
            <Input label="Symbol" value={symbol} onChange={setSymbol} required />
            <Input label="Currency" value={currency} onChange={setCurrency} required pattern="[A-Za-z]{3}" />
            <Input label="Analysis date" value={asOf} onChange={setAsOf} type="date" required />
          </div>
          {mode === 'fundamentals' ? <>
            <p className="note">Use consistent currency units and share units. Capex is a positive outflow. Leave unknown values blank. Returns and yields cover the statement period and are not annualized.</p>
            <StatementEditor title="Current statement" value={statement} onChange={setStatement} />
            <Input label="Market capitalization (optional)" type="number" value={marketCap} onChange={setMarketCap} min={0} />
            <Toggle label="Compare with prior-year statement" checked={usePrior} onChange={setUsePrior} />
            {usePrior && <StatementEditor title="Prior-year statement" value={prior} onChange={setPrior} />}
          </> : <>
            <Input label="Fiscal period end" type="date" value={periodEnd} onChange={setPeriodEnd} required />
            <p className="note">Use one fiscal period, currency, split basis and EPS accounting basis across all estimates and actuals. Use a consistent price-target horizon.</p>
            <SnapshotEditor title="Current consensus" value={current} onChange={value => { setCurrent(value); setEdited(true) }} />
            <Input label="Spot price (optional)" type="number" value={spot} onChange={setSpot} min={0} />
            <Toggle label="Compare with previous consensus" checked={usePrevious} onChange={setUsePrevious} />
            {usePrevious && <SnapshotEditor title="Previous consensus" value={previous} onChange={value => { setPrevious(value); setEdited(true) }} />}
            <Toggle label="Include reported earnings" checked={useActual} onChange={setUseActual} />
            {useActual && <div className="equity-fields"><Input label="Actual EPS" type="number" value={actualEps} onChange={setActualEps} required />
              <Input label="Earnings publication date" type="date" value={published} onChange={setPublished} required />
              <p className="note">Current consensus must predate the earnings publication day.</p></div>}
          </>}
          <button className="primary" type="submit">{loading ? 'Calculating…' : 'Run analysis'} <span>→</span></button>
        </fieldset>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
      <section className="results" aria-busy={loading} aria-live="polite">
        {result ? <>
          {edited && <p className="equity-notice">Inputs have changed. Run analysis again to update these results.</p>}
          <div className="panel equity-summary"><h2>{result.symbol} · {result.currency}</h2><p>Analysis date: {result.asOf}</p>
            {'factors' in result ? <p>Statement: {result.periodStart} to {result.periodEnd} · published {result.publishedOn}</p> :
              <p>Fiscal period end: {result.fiscalPeriodEnd} · consensus observed {result.currentObservedOn}</p>}</div>
          {'factors' in result ? <FactorTable rows={Object.entries(result.factors).map(([key, factor]) => ({ label: labels[key] ?? key, factor, percentage: percentages.has(key) }))} /> : <>
            <ConsensusTable current={result.current} previous={result.previous} />
            <FactorTable rows={[{ label: 'EPS revision', factor: result.epsRevision, percentage: true },
              { label: 'Earnings surprise', factor: result.earningsSurprise, percentage: true },
              { label: 'Target upside', factor: result.targetUpside, percentage: true }]} />
            <p className="note">Revisions compare full snapshots and can reflect changes in analyst coverage. Target upside is not a predicted return.</p>
          </>}
        </> : <div className="panel equity-summary"><h2>{loading ? 'Calculating…' : 'Ready to analyse'}</h2><p>{loading ? 'Your results will appear here.' : 'Review the sample or enter your own data, then select Run analysis.'}</p></div>}
      </section>
    </div>
  </div>
}

function Input({ label, value, onChange, type = 'text', required = false, min, pattern }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: number; pattern?: string
}) {
  return <label className="field">{label}<input type={type} value={value} required={required} min={min} pattern={pattern}
    step={type === 'number' ? 'any' : undefined} onChange={e => onChange(e.target.value)} /></label>
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="equity-toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>
}
function StatementEditor({ title, value, onChange }: { title: string; value: Statement; onChange: (value: Statement) => void }) {
  const nonnegative = new Set(['capitalExpenditure', 'totalAssets', 'totalDebt', 'cash', 'currentAssets', 'currentLiabilities', 'dilutedShares'])
  return <fieldset className="equity-group"><legend>{title}</legend><div className="equity-fields">
    <Input label="Period start" type="date" value={value.periodStart} required onChange={v => onChange({ ...value, periodStart: v })} />
    <Input label="Period end" type="date" value={value.periodEnd} required onChange={v => onChange({ ...value, periodEnd: v })} />
    <Input label="Publication date" type="date" value={value.publishedOn} required onChange={v => onChange({ ...value, publishedOn: v })} />
    {fields.map(([key, label]) => <Input key={key} label={label} type="number" value={value.values[key] ?? ''}
      min={nonnegative.has(key) ? 0 : undefined} onChange={v => onChange({ ...value, values: { ...value.values, [key]: v } })} />)}
  </div></fieldset>
}
function SnapshotEditor({ title, value, onChange }: { title: string; value: Snapshot; onChange: (value: Snapshot) => void }) {
  function edit(index: number, key: keyof Analyst, text: string) {
    onChange({ ...value, estimates: value.estimates.map((e, i) => i === index ? { ...e, [key]: text } : e) })
  }
  return <fieldset className="equity-group"><legend>{title}</legend>
    <Input label="Snapshot date" type="date" value={value.observedOn} required onChange={v => onChange({ ...value, observedOn: v })} />
    {value.estimates.map((e, i) => <fieldset className="equity-analyst" key={i}><legend>Analyst {i + 1}</legend><div className="equity-fields">
      <Input label="Analyst name / ID" value={e.analyst} required onChange={v => edit(i, 'analyst', v)} />
      <Input label="Estimate date" type="date" value={e.observedOn} required onChange={v => edit(i, 'observedOn', v)} />
      <Input label="EPS estimate" type="number" value={e.eps} required onChange={v => edit(i, 'eps', v)} />
      <Input label="Price target (optional)" type="number" value={e.priceTarget} min={0} onChange={v => edit(i, 'priceTarget', v)} />
    </div><button type="button" className="text-button" disabled={value.estimates.length === 1}
      onClick={() => onChange({ ...value, estimates: value.estimates.filter((_, index) => index !== i) })}>Remove analyst {i + 1}</button></fieldset>)}
    <button type="button" className="text-button" disabled={value.estimates.length >= 1000} onClick={() => onChange({ ...value,
      estimates: [...value.estimates, { analyst: '', observedOn: value.observedOn, eps: '', priceTarget: '' }] })}>+ Add analyst</button>
  </fieldset>
}
function FactorValue({ factor, percentage = false }: { factor: Factor; percentage?: boolean }) {
  return factor.value === null ? <span className="muted">Unavailable — {factor.unavailableReason ?? 'Missing input.'}</span> :
    <>{percentage ? percent.format(factor.value) : fmt.format(factor.value)}</>
}
function FactorTable({ rows }: { rows: { label: string; factor: Factor; percentage?: boolean }[] }) {
  return <div className="panel table-panel"><h2>Factors</h2><div className="table-scroll"><table><thead><tr><th>Factor</th><th>Value</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td><FactorValue factor={row.factor} percentage={row.percentage} /></td></tr>)}</tbody></table></div></div>
}
function ConsensusTable({ current, previous }: { current: Consensus; previous: Consensus | null }) {
  function rows(c: Consensus): (number | null)[] { return [c.analystCount, c.meanEps, c.medianEps, c.populationStandardDeviation, c.meanPriceTarget, c.priceTargetCount] }
  const names = ['Analysts', 'Mean EPS', 'Median EPS', 'Population standard deviation', 'Mean price target', 'Price-target coverage']
  return <div className="panel table-panel"><h2>Consensus</h2><div className="table-scroll"><table><thead><tr><th>Measure</th><th>Current</th>{previous && <th>Previous</th>}</tr></thead><tbody>
    {names.map((name, i) => <tr key={name}><td>{name}</td><td>{rows(current)[i] === null ? 'Unavailable' : fmt.format(rows(current)[i]!)}</td>
      {previous && <td>{rows(previous)[i] === null ? 'Unavailable' : fmt.format(rows(previous)[i]!)}</td>}</tr>)}
    <tr><td>Relative dispersion</td><td><FactorValue factor={current.relativeDispersion} percentage /></td>{previous && <td><FactorValue factor={previous.relativeDispersion} percentage /></td>}</tr>
  </tbody></table></div></div>
}
