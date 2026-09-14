import type { BondAnalysisResponse, CurvePoint } from './types'
import './CurvePanel.css'

export const initialCurve: CurvePoint[] = [
  { maturityYears: .5, rate: .03 }, { maturityYears: 1, rate: .0325 },
  { maturityYears: 2, rate: .035 }, { maturityYears: 5, rate: .04 },
  { maturityYears: 10, rate: .045 },
]
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 6 })

export function CurveEditor({ points, onChange }: { points: CurvePoint[]; onChange: (p: CurvePoint[]) => void }) {
  function edit(index: number, field: keyof CurvePoint, value: number) {
    onChange(points.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }
  return <fieldset className="curve-editor"><legend>Annual zero rates</legend>
    <p className="note">Illustrative inputs, not live quotes. Enter zero rates, not coupon rates or bond yields to maturity.</p>
    {points.map((p, i) => <div className="curve-row" key={i}>
      <label>Years<input required type="number" min="0.001" max="100" step="any" value={Number.isFinite(p.maturityYears) ? p.maturityYears : ''} onChange={e => edit(i, 'maturityYears', e.target.valueAsNumber)} /></label>
      <label>Rate %<input required type="number" min="-50" max="100" step="any" value={Number.isFinite(p.rate) ? p.rate * 100 : ''} onChange={e => edit(i, 'rate', e.target.valueAsNumber / 100)} /></label>
      <button className="text-button" type="button" aria-label={`Remove curve point ${i + 1}`} disabled={points.length <= 2} onClick={() => onChange(points.filter((_, j) => j !== i))}>×</button>
    </div>)}
    <button className="text-button" type="button" disabled={points.length >= 30} onClick={() => {
      let tenor = 1
      while (points.some(p => p.maturityYears === tenor)) tenor++
      onChange([...points, { maturityYears: tenor, rate: .04 }])
    }}>+ Add point</button>
    <p className="note">Linear interpolation between points; constant endpoint rates outside the curve. Maturity must contain whole coupon periods.</p>
  </fieldset>
}

export function CurveResults({ result }: { result: BondAnalysisResponse }) {
  const points = result.curvePoints ?? []
  if (!points.length) return null
  const maxT = Math.max(result.instrument.maturityYears, ...points.map(p => p.maturityYears))
  const low = Math.min(...points.map(p => p.rate)) - .005
  const high = Math.max(...points.map(p => p.rate)) + .005
  const x = (t: number) => 65 + t / maxT * 705
  const y = (rate: number) => 180 - (rate - low) / (high - low) * 150
  const plotted = [{ maturityYears: 0, rate: points[0].rate }, ...points]
  if (maxT > points[points.length - 1].maturityYears) plotted.push({ maturityYears: maxT, rate: points[points.length - 1].rate })
  return <>
    <section className="panel chart-panel"><p className="eyebrow">APPLIED ZERO CURVE</p><h2>Rates by payment maturity</h2>
      <div className="chart"><svg viewBox="0 0 800 225" role="img" aria-label="Annual zero rate by maturity in years">
        {[low, (low + high) / 2, high].map(rate => <g key={rate}><line className="axis" x1="65" x2="770" y1={y(rate)} y2={y(rate)} /><text x="55" y={y(rate) + 4} textAnchor="end">{(rate * 100).toFixed(2)}%</text></g>)}
        <polyline className="line" points={plotted.map(p => `${x(p.maturityYears)},${y(p.rate)}`).join(' ')} />
        {points.map(p => <circle className="point" key={p.maturityYears} cx={x(p.maturityYears)} cy={y(p.rate)} r="4"><title>{p.maturityYears} years: {number.format(p.rate * 100)}%</title></circle>)}
        {[0, maxT / 2, maxT].map(t => <text key={t} x={x(t)} y="201" textAnchor="middle">{number.format(t)}</text>)}
        <text x="415" y="222" textAnchor="middle">Maturity (years)</text>
      </svg></div>
      <p className="note">Annual compounding. Each scenario shifts every zero rate equally. Results reflect the last completed analysis.</p>
    </section>
    <section className="panel table-panel"><h2>Discounting each payment</h2><div className="table-scroll"><table><thead><tr><th>Year</th><th>Cash flow</th><th>Zero rate</th><th>Discount factor</th><th>Present value</th></tr></thead>
      <tbody>{result.cashflows.map(cf => <tr key={cf.timeYears}><td>{number.format(cf.timeYears)}</td><td>{number.format(cf.amount)}</td><td>{number.format(cf.zeroRate * 100)}%</td><td>{number.format(cf.discountFactor)}</td><td>{number.format(cf.presentValue)}</td></tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>Total present value</td><td>{number.format(result.metrics.presentValue)}</td></tr></tfoot>
    </table></div></section>
  </>
}
