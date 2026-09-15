import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  analyseOption,
  loadIbkrOptionSnapshot,
} from './api'
import type {
  IbkrOptionSnapshot,
  IbkrOptionSnapshotRequest,
  OptionAnalysisRequest,
  OptionAnalysisResponse,
} from './types'
import { TermHelp } from './TermHelp'
import './OptionsWorkbench.css'

const marketDefaults: IbkrOptionSnapshotRequest = {
  symbol: 'AAPL',
  expiry: '2026-10-16',
  strike: 335,
  optionType: 'Call',
}

const defaults: OptionAnalysisRequest = {
  optionType: 'Call',
  spot: 100,
  strike: 100,
  riskFreeRate: 0.05,
  dividendYield: 0,
  volatility: 0.20,
  timeToExpiry: 1,
  marketPrice: 10.4506,
}

const fmt = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 4,
})

function calculateTimeToExpiry(expiry: string): number {
  const [year, month, day] = expiry
    .split('-')
    .map(Number)

  const expiryTime = Date.UTC(year, month - 1, day, 20)
  const millisecondsPerYear =
    365.25 * 24 * 60 * 60 * 1000

  return Math.max(
    (expiryTime - Date.now()) / millisecondsPerYear,
    1 / 365.25,
  )
}


const signed = (value: number) =>
  `${value > 0 ? '+' : ''}${fmt.format(value)}`

export function OptionsWorkbench() {
  const [input, setInput] =
    useState<OptionAnalysisRequest>(defaults)

  const [result, setResult] =
    useState<OptionAnalysisResponse | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
const [marketRequest, setMarketRequest] =
  useState<IbkrOptionSnapshotRequest>(marketDefaults)

const [marketSnapshot, setMarketSnapshot] =
  useState<IbkrOptionSnapshot | null>(null)

const [marketLoading, setMarketLoading] =
  useState(false)

const [marketError, setMarketError] =
  useState<string | null>(null)

  const changeMarketRequest =
  <K extends keyof IbkrOptionSnapshotRequest>(
    key: K,
    value: IbkrOptionSnapshotRequest[K],
  ) => {
    setMarketRequest(current => ({
      ...current,
      [key]: value,
    }))
  }
async function loadMarketData() {
  setMarketLoading(true)
  setMarketError(null)

  try {
    const snapshot =
      await loadIbkrOptionSnapshot(marketRequest)

    setMarketSnapshot(snapshot)

    const updatedInput: OptionAnalysisRequest = {
      ...input,
      optionType: snapshot.optionType,
      spot: snapshot.underlying.preferredPrice,
      strike: snapshot.strike,
      marketPrice: snapshot.option.preferredPrice,
      timeToExpiry: calculateTimeToExpiry(
        marketRequest.expiry,
      ),
    }

    setInput(updatedInput)
    await run(updatedInput)
  } catch (reason) {
    setMarketError(
      reason instanceof Error
        ? reason.message
        : 'The IBKR snapshot could not be loaded.',
    )
  } finally {
    setMarketLoading(false)
  }
}
  async function run(value: OptionAnalysisRequest) {
    setLoading(true)
    setError(null)

    try {
      setResult(await analyseOption(value))
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The calculation failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void run(defaults)
  }, [])

  const change = <K extends keyof OptionAnalysisRequest>(
    key: K,
    value: OptionAnalysisRequest[K],
  ) => {
    setInput(current => ({
      ...current,
      [key]: value,
    }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(input)
  }

const reset = () => {
  setInput(defaults)
  setMarketRequest(marketDefaults)
  setMarketSnapshot(null)
  setMarketError(null)
  void run(defaults)
}
  return (
    <>
      <section className="intro">
        <div>
          <p className="eyebrow">DERIVATIVES LAB</p>
          <h1>Options Workbench</h1>
        </div>

        <p>
          Price a European option in the C++ Black-Scholes engine
          and explore its Greeks, payoff and volatility exposure.
        </p>
      </section>

      <div className="workspace">
        <form className="panel controls" onSubmit={submit}>
          <div className="panel-heading">
            <h2>Contract</h2>

            <button
              type="button"
              className="text-button"
              onClick={reset}
            >
              Reset
            </button>
          </div>
<section className="market-data-controls">
  <div className="subsection-heading">
    <div>
      <p className="eyebrow">IBKR MARKET DATA</p>
      <h3>Option quote snapshot</h3>
    </div>

    {marketSnapshot && (
      <span
        className={`data-status ${
          marketSnapshot.marketDataType === 'delayed'
            ? 'delayed'
            : 'live'
        }`}
      >
        {marketSnapshot.marketDataType}
      </span>
    )}
  </div>

  <label className="field">
    <span>
      <span>Symbol</span>
      <small>underlying ticker</small>
    </span>

    <input
      aria-label="IBKR symbol"
      type="text"
      required
      value={marketRequest.symbol}
      onChange={event =>
        changeMarketRequest(
          'symbol',
          event.target.value.toUpperCase(),
        )
      }
    />
  </label>

  <label className="field">
    <span>
      <span>Expiry</span>
      <small>contract expiration</small>
    </span>

    <input
      aria-label="IBKR expiry"
      type="date"
      required
      value={marketRequest.expiry}
      onChange={event =>
        changeMarketRequest(
          'expiry',
          event.target.value,
        )
      }
    />
  </label>

  <OptionField
    label="IBKR strike"
    hint="contract strike"
    value={marketRequest.strike}
    min={0.01}
    step={0.5}
    onChange={value =>
      changeMarketRequest('strike', value)
    }
  />

  <label className="field">
    <span>
      <span>IBKR option type</span>
      <small>call or put contract</small>
    </span>

    <select
      value={marketRequest.optionType}
      onChange={event =>
        changeMarketRequest(
          'optionType',
          event.target.value as 'Call' | 'Put',
        )
      }
    >
      <option value="Call">Call</option>
      <option value="Put">Put</option>
    </select>
  </label>

  <button
    type="button"
    className="secondary market-data-button"
    disabled={marketLoading || loading}
    onClick={() => void loadMarketData()}
  >
    {marketLoading
      ? 'Loading IBKR data…'
      : 'Load market data'}
  </button>

  {marketError && (
    <p className="error" role="alert">
      {marketError}
    </p>
  )}

  {marketSnapshot && (
    <div className="market-snapshot">
      <div>
        <small>Underlying</small>
        <strong>
          {fmt.format(
            marketSnapshot.underlying.preferredPrice,
          )}
        </strong>
        <span>
          {formatSpread(marketSnapshot.underlying)}
        </span>
      </div>

      <div>
        <small>Option</small>
        <strong>
          {fmt.format(
            marketSnapshot.option.preferredPrice,
          )}
        </strong>
        <span>
          {formatSpread(marketSnapshot.option)}
        </span>
      </div>

      <p>
        {marketSnapshot.option.localSymbol ??
          marketSnapshot.option.symbol}
      </p>

      <time dateTime={marketSnapshot.timestampUtc}>
        Snapshot:{' '}
        {new Date(
          marketSnapshot.timestampUtc,
        ).toLocaleString()}
      </time>
    </div>
  )}
</section>
          <label className="field">
            <span>
              <TermHelp term="Option type" />
              <small>right to buy / sell</small>
            </span>

            <select
              value={input.optionType}
              onChange={event =>
                change(
                  'optionType',
                  event.target.value as 'Call' | 'Put',
                )
              }
            >
              <option value="Call">Call</option>
              <option value="Put">Put</option>
            </select>
          </label>

          <OptionField
            label="Spot price"
            hint="underlying today"
            value={input.spot}
            min={0.01}
            step={0.01}
            onChange={value => change('spot', value)}
          />

          <OptionField
            label="Strike price"
            hint="exercise price"
            value={input.strike}
            min={0.01}
            step={0.01}
            onChange={value => change('strike', value)}
          />

          <OptionField
            label="Risk-free rate"
            hint="% annually"
            value={input.riskFreeRate * 100}
            min={-50}
            max={100}
            step={0.001}
            onChange={value =>
              change('riskFreeRate', value / 100)
            }
          />

          <OptionField
            label="Dividend yield"
            hint="% continuously compounded"
            value={input.dividendYield * 100}
            min={-50}
            max={100}
            step={0.001}
            onChange={value =>
              change('dividendYield', value / 100)
            }
          />

          <OptionField
            label="Volatility"
            hint="% annually"
            value={input.volatility * 100}
            min={0.01}
            max={500}
            step={0.01}
            onChange={value =>
              change('volatility', value / 100)
            }
          />

          <OptionField
            label="Time to expiry"
            hint="years"
            value={input.timeToExpiry}
            min={0.01}
            max={100}
            step={0.01}
            onChange={value =>
              change('timeToExpiry', value)
            }
          />

          <OptionField
            label="Market price"
            hint="for implied vol"
            value={input.marketPrice}
            min={0.0001}
            step={0.0001}
            onChange={value =>
              change('marketPrice', value)
            }
          />

          <button
            className="primary"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Calculating…' : 'Run analysis'}
            <span>→</span>
          </button>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>

        <section
          className={`results ${loading ? 'loading' : ''}`}
          aria-busy={loading}
        >
          {result ? (
            <OptionDashboard result={result} />
          ) : (
            <div className="panel empty">
              <i />
              <p>Running the native option model…</p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

type FieldProps = {
  label: string
  hint: string
  value: number
  min: number
  max?: number
  step: number
  onChange: (value: number) => void
}

function formatSpread(snapshot: {
  bid: number | null
  ask: number | null
}): string {
  if (snapshot.bid === null || snapshot.ask === null) {
    return 'Bid/ask unavailable'
  }

  return `Bid ${fmt.format(snapshot.bid)} · Ask ${fmt.format(
    snapshot.ask,
  )}`
}

function OptionField({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: FieldProps) {
  return (
    <label className="field">
      <span>
        <TermHelp term={label} />
        <small>{hint}</small>
      </span>

      <input
        aria-label={label}
        type="number"
        required
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={event => onChange(event.target.valueAsNumber)}
      />
    </label>
  )
}

function OptionDashboard({
  result,
}: {
  result: OptionAnalysisResponse
}) {
  const metrics = result.metrics

  return (
    <>
      <section className="metrics option-metrics">
        <OptionMetric
          label="Model price"
          value={fmt.format(metrics.modelPrice)}
          note="Black-Scholes fair value"
        />

        <OptionMetric
          label="Implied volatility"
          value={`${fmt.format(
            metrics.impliedVolatility * 100,
          )}%`}
          note="volatility backed out from market price"
        />

        <OptionMetric
          label="Delta"
          value={fmt.format(metrics.delta)}
          note="value change for a 1-unit spot move"
        />

        <OptionMetric
          label="Gamma"
          value={fmt.format(metrics.gamma)}
          note="change in Delta for a 1-unit spot move"
        />

        <OptionMetric
          label="Vega"
          value={fmt.format(
            metrics.vegaPerPercentagePoint,
          )}
          note="value change for +1 volatility point"
        />

        <OptionMetric
          label="Theta"
          value={fmt.format(metrics.thetaPerDay)}
          note="estimated value change per day"
        />

        <OptionMetric
          label="Rho"
          value={fmt.format(
            metrics.rhoPerPercentagePoint,
          )}
          note="value change for +1 rate point"
        />
      </section>

      <SpotChart result={result} />
      <VolatilityTable result={result} />
    </>
  )
}

function OptionMetric({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <article className="metric">
      <div className="metric-label">
        <TermHelp term={label} />
      </div>

      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function SpotChart({
  result,
}: {
  result: OptionAnalysisResponse
}) {
  const graph = useMemo(() => {
    const width = 860
    const height = 270
    const left = 58
    const right = 22
    const top = 18
    const bottom = 42
    const rows = result.spotScenarios

    const minX = Math.min(...rows.map(row => row.spot))
    const maxX = Math.max(...rows.map(row => row.spot))

    const maxY = Math.max(
      ...rows.flatMap(row => [
        row.modelPrice,
        row.payoffAtExpiry,
      ]),
      1,
    )

    const x = (value: number) =>
      left +
      ((value - minX) / (maxX - minX || 1)) *
        (width - left - right)

    const y = (value: number) =>
      top +
      ((maxY - value) / maxY) *
        (height - top - bottom)

    const prices = rows
      .map(row => `${x(row.spot)},${y(row.modelPrice)}`)
      .join(' ')

    const payoffs = rows
      .map(row => `${x(row.spot)},${y(row.payoffAtExpiry)}`)
      .join(' ')

    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      maxY,
      x,
      y,
      prices,
      payoffs,
    }
  }, [result])

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">SPOT SCENARIOS</p>
          <h2>
            <TermHelp term="Option value profile" />
          </h2>
        </div>

        <div className="dual-legend">
          <span>
            <i className="blue-dot" />
            Today
          </span>

          <span>
            <i className="green-dot" />
            At expiry
          </span>
        </div>
      </div>

      <div className="chart">
        <svg
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          role="img"
          aria-label="Option value and expiry payoff by underlying price"
        >
          <line
            className="axis"
            x1={graph.left}
            y1={graph.height - graph.bottom}
            x2={graph.width - graph.right}
            y2={graph.height - graph.bottom}
          />

          <polyline
            className="line"
            points={graph.prices}
          />

          <polyline
            className="payoff-line"
            points={graph.payoffs}
          />

          {result.spotScenarios.map(scenario => (
            <g key={scenario.spot}>
              <circle
                className="point"
                cx={graph.x(scenario.spot)}
                cy={graph.y(scenario.modelPrice)}
                r="4"
              >
                <title>
                  {`Spot ${fmt.format(
                    scenario.spot,
                  )}: value ${fmt.format(
                    scenario.modelPrice,
                  )}`}
                </title>
              </circle>

              <text
                x={graph.x(scenario.spot)}
                y={graph.height - 14}
                textAnchor="middle"
              >
                {fmt.format(scenario.spot)}
              </text>
            </g>
          ))}

          <text
            x={graph.left - 10}
            y={graph.top + 5}
            textAnchor="end"
          >
            {fmt.format(graph.maxY)}
          </text>

          <text
            x={graph.width / 2}
            y={graph.height}
            textAnchor="middle"
          >
            Underlying spot price
          </text>
        </svg>
      </div>

      <p className="note">
        Today’s option value includes time value. The expiry
        line shows intrinsic payoff when no time remains.
      </p>
    </section>
  )
}

function VolatilityTable({
  result,
}: {
  result: OptionAnalysisResponse
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">VOLATILITY SCENARIOS</p>
          <h2>
            <TermHelp term="Volatility exposure" />
          </h2>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Volatility</th>
              <th>Model price</th>
              <th>P&amp;L vs current model</th>
            </tr>
          </thead>

          <tbody>
            {result.volatilityScenarios.map(scenario => (
              <tr key={scenario.volatility}>
                <td>
                  {fmt.format(scenario.volatility * 100)}%
                </td>

                <td>{fmt.format(scenario.modelPrice)}</td>

                <td
                  className={
                    scenario.pnl >= 0
                      ? 'positive'
                      : 'negative'
                  }
                >
                  {signed(scenario.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}