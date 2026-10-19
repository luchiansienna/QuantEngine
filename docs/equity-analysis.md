# Fundamentals and investor expectations

`modules/QuantEngine.Fundamentals` and `modules/QuantEngine.InvestorExpectations`
are reusable .NET 8 libraries. The existing ASP.NET API references them directly;
these calculations do not use IBKR, `QuantCli`, CMake, or a market-data network call.
The C++ pricing and historical strategy engines remain separate. Add a project
reference to either library to use its static `Analyse(request)` entry point.

## Input contract

This is deterministic analysis of caller-supplied data, not a statement downloader,
sentiment model, price predictor, or trading recommendation. No credentials are
needed. There is no automatic FX conversion, statement normalization, TTM
aggregation, annualization, split adjustment, analyst deduplication, or restatement
selection. A provider adapter must perform those tasks before calling the engines.

Use the same symbol, uppercase three-letter currency, monetary scale, share scale,
and accounting basis throughout a request. Amounts are in currency units, shares
in shares; values reported in millions must be normalized consistently. EPS and
price targets use currency per share and must have the same split basis. For EPS,
use diluted weighted-average shares for the flow period, not ending shares.
Ratios are fractions (`0.15` means 15%); amount outputs retain the input scale.
Dates are ISO `yyyy-MM-dd`, with day-level precision. Callers are responsible for
using data actually available on that day, including market prices and restatements.

All numbers must be finite and have absolute value at most `1e24`. Missing optional
values are `null`, never silently zero. Capex is a **positive cash outflow**; debt,
cash, assets, liabilities and shares are nonnegative. Losses, negative equity and
negative operating cash flow are allowed. A zero denominator, nonpositive base
for ordinary ratios, missing input, or numeric overflow returns a factor with
`value: null` and `unavailableReason`. Valid zero numerators remain zero.
Malformed inputs throw `ArgumentException` (HTTP 400). A genuinely reported EPS
of zero must be supplied explicitly; omitted EPS is rejected during JSON binding.

## Fundamentals

`POST /api/fundamentals/analyse`

```json
{
  "asOf": "2026-03-01",
  "current": {
    "symbol": "TEST", "currency": "USD",
    "periodStart": "2025-01-01", "periodEnd": "2025-12-31",
    "publishedOn": "2026-02-01",
    "revenue": 200, "grossProfit": 100, "operatingIncome": 50,
    "netIncome": 20, "operatingCashFlow": 40, "capitalExpenditure": 10,
    "totalAssets": 400, "totalEquity": 100, "totalDebt": 60, "cash": 80,
    "currentAssets": 90, "currentLiabilities": 30, "dilutedShares": 10
  },
  "marketCapitalization": 500
}
```

Flow values cover exactly the supplied period; balances refer to period end.
Periods must be 1–371 days (allowing a 53-week fiscal year). Publication cannot
precede period end or follow `asOf`. The optional `priorYear` statement uses the
same schema. Its symbol and currency must match, its end must be 365 ±14 days
earlier, and its duration must be within 7 days of the current period. These
tolerances accommodate fiscal calendars; callers must still align fiscal periods.
Only explicitly provided prior-year values are used, so no future statement is
selected from a history implicitly.

The response includes symbol, currency, analysis date, flow period, publication
date and a `factors` dictionary. Every factor has `value` and `unavailableReason`.

| Factor | Formula |
| --- | --- |
| grossMargin | grossProfit / revenue |
| operatingMargin | operatingIncome / revenue |
| netMargin | netIncome / revenue |
| cashFlowMargin | operatingCashFlow / revenue |
| freeCashFlow | operatingCashFlow − capitalExpenditure |
| freeCashFlowMargin | freeCashFlow / revenue |
| returnOnEndingAssets | netIncome / totalAssets |
| returnOnEndingEquity | netIncome / totalEquity |
| debtToEquity | totalDebt / totalEquity |
| currentRatio | currentAssets / currentLiabilities |
| netDebt | totalDebt − cash (can be negative) |
| dilutedEps | netIncome / dilutedShares |
| earningsYield | netIncome / marketCapitalization |
| freeCashFlowYield | freeCashFlow / marketCapitalization |
| revenueGrowthYoY | (current revenue − prior revenue) / abs(prior revenue) |
| netIncomeGrowthYoY | (current netIncome − prior netIncome) / abs(prior netIncome) |

Growth uses the absolute prior base to keep improvement from a loss positive.
It is undefined when the prior base is zero. Return factors deliberately use
**ending balances**, not average balances. Yields and returns refer to the supplied
flow period and are **not annualized**. A quarterly earnings yield is therefore
not comparable to an annual yield without caller normalization. In the example,
FCF is 30, net margin is 0.1, EPS is 2 and FCF yield is 0.06.

## Investor expectations

`POST /api/investor-expectations/analyse`

```json
{
  "symbol": "TEST", "currency": "USD", "asOf": "2026-03-01",
  "fiscalPeriodEnd": "2025-12-31",
  "current": {
    "observedOn": "2026-01-31",
    "estimates": [
      { "analyst": "A", "observedOn": "2026-01-30", "eps": 1, "priceTarget": 100 },
      { "analyst": "B", "observedOn": "2026-01-31", "eps": 3, "priceTarget": 140 }
    ]
  },
  "previous": {
    "observedOn": "2026-01-01",
    "estimates": [{ "analyst": "A", "observedOn": "2026-01-01", "eps": 1 }]
  },
  "actual": { "publishedOn": "2026-02-01", "eps": 2.5 },
  "spotPrice": 100
}
```

Each snapshot contains 1–1000 analysts. Analyst identifiers must be unique after
trimming and ignoring case. Each estimate must have been observed by the snapshot
date, which must be no later than `asOf`. The previous snapshot must strictly
precede the current one. All EPS estimates and actuals belong to the one requested
fiscal period and use the same GAAP/adjusted and annual/quarterly basis; this is a
caller contract. Choose a consistent target horizon (for example 12 months).
Stale observations are not silently dropped; callers must apply freshness rules.

The response echoes snapshot and actual publication dates for auditing and returns:

| Output | Definition |
| --- | --- |
| current / previous consensus | Unweighted mean EPS, median EPS, analyst count |
| populationStandardDeviation | sqrt(mean((EPS − mean EPS)²)); zero for one analyst |
| relativeDispersion | population SD / abs(mean EPS) |
| meanPriceTarget / priceTargetCount | Mean and coverage of non-null targets only |
| epsRevision | (current mean EPS − previous mean EPS) / abs(previous mean EPS) |
| earningsSurprise | (actual EPS − current mean EPS) / abs(current mean EPS) |
| targetUpside | (current mean target − spotPrice) / spotPrice |

Revisions compare full consensus snapshots, so changing analyst coverage can change
the revision; this is not a matched-analyst revision. No weighting or calibrated
forecast confidence is implied by dispersion. Targets may represent different
opinions, and target upside is not an expected return. Spot price is caller-supplied
as of the analysis date, so target upside may combine an older consensus with a
newer price. There is no implied-growth/reverse-DCF assumption hidden in the result.

Actual EPS is optional. If supplied, its publication must be on/after fiscal period
end and by `asOf`. The current snapshot must **strictly precede** that publication
day to exclude post-announcement estimates. Same-day consensus is rejected because
day-level dates cannot establish intraday order. In the example, consensus EPS is
2, population SD is 1, revision is 1, surprise is 0.25 and target upside is 0.2.
Missing previous/actual/spot data only makes the corresponding factors unavailable.

## Verification

```sh
dotnet run --project tests/EquityAnalysisHarness -c Release
```

The dependency-free harness references both real libraries and links the production
endpoint registration into a temporary local ASP.NET host. It tests numeric
fixtures, negative/zero/missing inputs, invalid and future dates, mismatched periods,
duplicate analysts, JSON contracts and real HTTP 200/400 responses. The GitHub
Actions equity-analysis workflow runs it with .NET 8 on every push and pull request.
The full `apps/QuantWebApi` still requires its existing local IBKR API DLL setup;
the harness does not require that proprietary dependency.
