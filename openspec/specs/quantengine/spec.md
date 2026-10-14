# QuantEngine as-is specification

## Purpose

Describe the existing QuantEngine research and analysis application. This baseline records observed code behavior; SHALL statements below preserve that behavior rather than propose new functionality.

## Baseline and evidence

- Inspected: 14 October 2026.
- Repository: https://github.com/luchiansienna/QuantEngine
- Working branch: `main`.
- Baseline commit: `7250cfaba048f0e6d705e18da136acc52e68c798`. The tracked tree matches the originally inspected feature-branch commit `252b790333fb685a45287ca75b973d6399ff337a`.
- Local checkout: `C:\QUANT\QuantEngine`; tracked files were unchanged when inspected. Existing untracked `.agents/`, `.claude/` and OpenSpec initialization files are outside this documentation commit.
- Recommended repository location: `openspec/specs/quantengine/spec.md`.
- Verification level: static inspection of source, request contracts, documentation and existing test definitions. No application, build, test suite or IBKR connection was executed for this documentation task. Implemented means present and connected in code, not verified in a live deployment.
- This baseline describes local `main`, which includes the merged multi-asset efficient-frontier functionality.

## Requirements

### Requirement: Workbench navigation

The dashboard SHALL expose Bond risk, Options, Credit & market risk, Stock strategies and Portfolio frontier workbenches. It SHALL open on Bond risk and request the default bond analysis on initial load. Numeric rates in API requests use decimal units; dashboard percentage controls convert them to decimals.

#### Scenario: Open the dashboard
- **WHEN** the dashboard loads with an available API and native worker
- **THEN** it requests the default bond analysis and presents valuation, risk metrics and scenarios.
- **AND** the user can select each of the five workbenches.

### Requirement: Fixed-rate bond analysis

The system SHALL analyse a fixed-rate bond from face value, annual coupon rate, maturity in years, payment frequency, flat annual yield and basis-point shocks. The API/CLI support annual, semiannual, quarterly and monthly coupons and require whole coupon periods. Coupons equal face value times annual coupon rate divided by frequency; principal is added to the final coupon.

The result SHALL contain present value, Macaulay duration, modified duration, DV01, convexity, dated-by-year cash flows and exact versus approximate scenario P&L. Flat discounting uses `amount / (1 + yield)^timeYears`. This is a year-based schedule without settlement dates or accrued-interest handling.

#### Scenario: Run flat-yield analysis
- **WHEN** valid bond inputs and yield shocks are submitted to `POST /api/bonds/analyse`
- **THEN** the response contains the instrument, valuation metrics, cash flows and shocked prices.
- **AND** each scenario includes exact P&L, duration P&L and duration-plus-convexity P&L.

### Requirement: Zero-rate curve valuation

The system SHALL accept a supplied zero-rate curve instead of flat-yield valuation. It SHALL sort unique positive tenors, linearly interpolate rates between points, use flat extrapolation outside the curve and discount each cash flow using `(1 + zeroRate)^(-timeYears)`. Curve scenarios SHALL shift all zero rates in parallel by the supplied basis points. Curve duration and convexity represent parallel curve sensitivity; the Macaulay-labelled result represents PV-weighted cash-flow timing.

#### Scenario: Use a supplied curve
- **WHEN** valid curve points accompany a bond request
- **THEN** the response identifies curve valuation and includes the curve, cash-flow zero rates and discount factors.
- **AND** the dashboard presents curve results and parallel-shift scenarios.

### Requirement: European option analysis

The system SHALL price European calls and puts with Black–Scholes from spot, strike, risk-free rate, volatility and time to expiry, and infer implied volatility from an entered market price. Results SHALL include model price, intrinsic value, delta, gamma, vega per percentage point, theta per day and rho per percentage point. It SHALL produce spot-price/payoff scenarios and volatility-price/P&L scenarios. The CLI checks strict no-arbitrage market-price bounds; numerical implied-volatility failure can reject an otherwise admissible request.

Current limitation: the dashboard includes `dividendYield`, but the API request record, worker command and native option instrument omit it. Option pricing therefore uses the existing zero-dividend model regardless of that control. Dividend-adjusted option pricing is not an implemented capability.

#### Scenario: Analyse a valid option
- **WHEN** valid supported option inputs are submitted to `POST /api/options/analyse`
- **THEN** the native response contains pricing, implied volatility, Greeks and scenario arrays.

#### Scenario: Change the displayed dividend yield
- **WHEN** only the options dashboard dividend-yield value changes
- **THEN** it is not passed into the native option pricing calculation at this baseline.

### Requirement: IBKR option snapshots

The system SHALL resolve a requested option contract and obtain snapshots for the option and underlying through its configured TWS/IB Gateway connection. Results include contract identity, currency, available bid/ask/last/close/midpoint values, preferred price, timestamp and market-data type. The dashboard SHALL fill spot, strike, option market price and estimated time to expiry from the snapshot, then run analysis. A snapshot is dependent on connectivity, contract resolution and data permissions; it is not a guarantee of a live executable quote.

#### Scenario: Load an option snapshot
- **WHEN** `GET /api/market-data/options/snapshot` receives a supported symbol, expiry, strike and option type and IBKR responds successfully
- **THEN** the system returns underlying and option snapshots.
- **AND** the dashboard uses the returned preferred prices for analysis.

### Requirement: Stock history and dataset reuse

The system SHALL request 1–5 years of daily regular-hours IBKR TRADES history for USD stock contracts resolved through SMART with a supplied primary exchange. Supported primary exchanges are NASDAQ, NYSE, ARCA and AMEX. It SHALL exclude the current New York date, return ascending completed daily open/close bars and identify the price basis as split-adjusted with cash dividends excluded.

Loaded datasets SHALL be stored in a bounded in-memory cache of up to 32 entries for up to 30 minutes. Only one history download may run at a time, with at least 15 seconds between download starts. Backtests SHALL reuse the requested dataset ID rather than silently download different prices.

#### Scenario: Reuse history for parameter comparisons
- **WHEN** the user loads history through `POST /api/market-data/stocks/history` and reruns a backtest with its retained dataset ID
- **THEN** the backtest uses the same stored bars.

#### Scenario: Dataset is no longer available
- **WHEN** a backtest refers to an unknown, evicted or expired dataset
- **THEN** the API returns HTTP 410 and tells the user to load history again.

### Requirement: Runnable stock strategy catalog

`GET /api/strategies` SHALL supply these four implemented strategies with descriptions, parameter bounds and defaults:

| Strategy ID | Existing rule | Defaults |
|---|---|---|
| `sma-long-cash` | Long when fast SMA exceeds slow SMA; otherwise cash | fast 20, slow 50 sessions |
| `momentum-long-cash` | Long when close exceeds close from the lookback period; otherwise cash | lookback 126 sessions |
| `rsi-mean-reversion` | Enter below the RSI entry threshold when price is above trend SMA; exit above the exit threshold | Wilder RSI 2, trend SMA 200, entry 10, exit 70 |
| `martingale-long-cash` | Repeated long round trips with capped stake doubling after net losses | base stake 1%, holding 5 sessions, maximum 6 doublings |

The API SHALL validate strategy parameters, including fast SMA below slow SMA, RSI entry below exit and martingale base stake no greater than the allocation cap. The dashboard SHALL show a retryable error for an invalid/incompatible catalog. No additional runnable strategy is established by the inspected catalog.

#### Scenario: Select and run a strategy
- **WHEN** the user selects one of the four catalog strategies and submits valid settings with available history to `POST /api/strategies/stocks/backtest`
- **THEN** the API invokes the corresponding native strategy and returns its result.

### Requirement: Shared stock simulation behavior

Stock strategies SHALL decide using data through a session's close and execute at the next session's open. Buys increase the open price by slippage, sells decrease it, and fees apply per side. Position sizing SHALL allow fractional shares, remain long/cash and avoid borrowing. Initial cash, entry allocation or maximum stake, fees and slippage are configurable.

The buy-and-hold benchmark SHALL enter at the first eligible execution session, with the same initial stake and entry costs. Results SHALL retain warm-up length and benchmark allocation and return daily cash, shares, strategy equity, benchmark equity, fills, fees, final equity, total return and maximum drawdown. Final positions SHALL remain marked to the last close without forced liquidation. Cash dividends, cash interest, taxes and market impact are excluded.

#### Scenario: Execute without same-close fills
- **WHEN** a close generates a changed target position
- **THEN** the corresponding fill occurs at the following session's open with configured fees and slippage.

### Requirement: Martingale stake lifecycle

Martingale SHALL hold a trade for the configured number of closes and exit at the following open. After a net realized loss it doubles the next dollar stake up to the configured doubling limit; a profit resets the level and recalculates base stake from current cash; break-even preserves the level. The base dollar stake remains fixed during a losing sequence. Every entry budget includes entry fees and is capped by available cash times maximum-stake allocation. At the doubling cap it repeats the capped level until a profit. The benchmark starts with the base stake rather than the maximum stake cap.

#### Scenario: A completed trade loses money
- **WHEN** a martingale round trip closes with a net loss after fees and slippage
- **THEN** the next stake escalates within the doubling and available-cash caps.
- **AND** the strategy does not add to an open losing position.

### Requirement: Stock result exploration and export

The dashboard SHALL show strategy/benchmark returns, maximum drawdown, Sharpe, CAGR, time in market and closed-trade win rate; display equity, price/indicator and drawdown charts; and provide a session slider and fill table. Sharpe uses daily returns, 252-session annualisation and a zero risk-free assumption. Sharpe, CAGR and exposure calculations account for strategy warm-up. Parameter changes SHALL mark the displayed result as belonging to the previous run until rerun. JSON export SHALL include history and the native backtest response.

#### Scenario: Export a completed stock run
- **WHEN** the user selects Export results
- **THEN** a JSON download contains the history, identifying metadata and calculation result, including daily equity data.

### Requirement: Multi-asset portfolio frontier

The Portfolio frontier SHALL analyse 2–8 uniquely named series in one currency, obtained through existing stock-history requests or multiple imported JSON files. Price mode uses daily closes; strategy mode uses exported backtest equity. Imports replace the prior set. It SHALL require at least 61 common daily observations, positive finite values and unique dates, trim differing endpoints and reject inconsistent missing sessions inside the shared date range.

It SHALL calculate daily simple returns, annual arithmetic means as daily mean times 252, and annual unbiased sample covariance as daily covariance times 252. In the browser, it SHALL calculate a long-only, fully invested frontier with 81 target-return samples from global minimum variance to the highest asset mean. Weights sum to one; optimisation uses a `1e-10` diagonal stabiliser and displayed risk uses original covariance. Best Sharpe means the best sampled frontier point, not a continuous tangency solution.

The dashboard SHALL allow selection by frontier point, slider, minimum variance, equal weights or best sampled Sharpe and show allocation, annual return estimate, volatility, Sharpe and covariance. Risk-free rate is user supplied and defaults to zero. Sharpe is annual arithmetic excess return divided by annual volatility and is undefined when volatility is effectively zero.

#### Scenario: Analyse aligned imported strategy runs
- **WHEN** 2–8 valid same-currency backtest exports with sufficient aligned equity observations are imported in strategy mode
- **THEN** the frontier derives returns and covariance from equity curves, including their existing simulated costs.
- **AND** selecting an allocation updates weights and its displayed metrics together.

#### Scenario: Reject unsuitable series
- **WHEN** input contains mixed currencies, duplicate names, nonpositive values, too few common dates or inconsistent interior sessions
- **THEN** calculation stops with an explanatory error.

### Requirement: Forward exposure, CVA and market risk

The Credit & market risk workbench SHALL simulate a portfolio of signed-quantity forwards on one underlying and one common maturity using constant-parameter geometric Brownian motion. Exposure SHALL net forward values before applying constant collateral and flooring at zero. It SHALL provide clean value, expected exposure and PFE by time, peak PFE, unilateral CVA, CVA-adjusted value, horizon VaR and expected shortfall.

Exposure simulation uses risk-neutral drift; market-risk simulation uses entered physical drift in a separate seeded random stream. CVA uses constant hazard/recovery, discounted expected exposure and interval default probabilities. Horizon losses are clean value minus horizon mark-to-market without financing/carry adjustment. Inputs include seed, paths, steps, confidence and horizon; supported limits include 100–100,000 paths, 1–120 steps, at most 2,000,000 path-steps and 1–100 forwards. The horizon cannot exceed maturity.

#### Scenario: Calculate risk for a valid forward portfolio
- **WHEN** supported simulation inputs reach `POST /api/risk/analyse`
- **THEN** the response includes exposure profiles, credit adjustment, market risk and calculation metadata.
- **AND** the dashboard can download input/results JSON and netting-set EE/PFE CSV with context and an input-snapshot hash.

### Requirement: Defaultable bond valuation

The system SHALL price a fixed-coupon defaultable bond with flat continuously compounded risk-free and hazard rates, survival-weighted contractual payments and fractional recovery of par at default. It SHALL return risk-free price, risky price, credit adjustment and cumulative default probability. The calculation assumes valuation on a coupon date with no accrued interest.

#### Scenario: Price a credit bond
- **WHEN** valid whole-period coupon inputs reach `POST /api/risk/credit-bond`
- **THEN** the response returns both prices, their difference and `1 - exp(-hazardRate * maturity)` default probability.

### Requirement: Historical VaR and expected shortfall

The system SHALL accept supplied portfolio P&Ls, convert profits/losses into losses, use a nearest-rank empirical quantile for VaR and calculate expected shortfall over the worst tail mass with fractional boundary weighting. It SHALL accept confidence from 50% to 99.99% and 1–100,000 finite observations. It does not revalue raw historical market prices or apply square-root-of-time scaling.

#### Scenario: Analyse supplied P&Ls
- **WHEN** valid P&Ls reach `POST /api/risk/historical-var`
- **THEN** the response contains VaR, expected shortfall and observation count.

### Requirement: Exposure reconciliation

The system SHALL compare engine and reporting exposure records by trade ID, counterparty, netting set, metric and tenor. It SHALL flag duplicates, missing records and context differences in as-of date, currency, confidence, model version or scenario ID before numeric comparison. For comparable records it SHALL calculate reporting minus engine and match when its absolute value is at most `max(absoluteTolerance, relativeTolerance * abs(engineValue))`. Missing records are not zero exposure. There is no FX conversion.

#### Scenario: Reconcile exposure files
- **WHEN** valid engine and reporting rows reach `POST /api/risk/reconcile`
- **THEN** the result retains source rows and reports matched, value-break, context-mismatch, duplicate and missing statuses as applicable.
- **AND** the dashboard shows up to 500 keys and can export the complete JSON report.

### Requirement: Native worker and errors

The API SHALL run one persistent QuantCli worker per API instance, start it on demand without a shell, serialise requests and exchange one request/JSON response per line. A timeout includes queue waiting time. A cancelled or failed worker read SHALL discard the worker before a subsequent request can consume its reply. Recognised invalid inputs produce HTTP 400; calculation timeouts produce 504. IBKR endpoints additionally map broker failures to 502 and history pacing/concurrency limits to 429. These are explicit mappings, not a guarantee that every internal failure has a specialised error response.

#### Scenario: Retry after a worker timeout
- **WHEN** an in-flight native worker read is cancelled or fails
- **THEN** that worker is stopped and a later request can start a fresh worker.

### Requirement: Additional native entry points

The native library SHALL provide bond yield-to-maturity solving and fixed-income portfolio market value, aggregate DV01 and parallel-shock P&L. These are implemented library/console capabilities, not additional dashboard tabs or API endpoints. QuantCli SHALL support standalone bond JSON analysis, CSV stock backtests with `date,open,close`, and persistent server commands for bond, option, risk, credit bond, historical VaR and stock backtests. The legacy SMA stream and request settings remain supported alongside the versioned strategy protocol.

#### Scenario: Supply a valid daily-bar CSV
- **WHEN** a supported standalone backtest command reads a valid ascending `date,open,close` CSV
- **THEN** it runs the native simulation and returns results without an IBKR connection.

## Implemented versus planned or absent

| Area | Status at the baseline |
|---|---|
| Five dashboard workbenches, four stock algorithms, IBKR history/snapshots, risk API and native worker | Implemented in inspected code; live integration not exercised |
| Multi-asset frontier | Implemented on this working branch; computed in browser |
| YTM and fixed-income portfolio aggregates | Implemented native/console scope; not web features |
| Option dividend-yield adjustment | UI control exists; calculation integration absent |
| OpenSpec baseline and future change workflow | OpenSpec is initialized in this checkout; this task adds the as-is baseline spec |
| Additional named future features | No explicit roadmap established from inspected files; do not treat speculative additions as planned commitments |

Existing model exclusions: stock dividends/cash interest/taxes/market impact; portfolio shorting/leverage, FX conversion, inflation and additional rebalancing costs; option early exercise and dividend adjustment; richer credit models beyond the supplied forward/flat-hazard scope. No brokerage order-submission flow or durable research dataset database was found in the inspected application. These are scope limits, not promises to implement them.

## Evidence map

All paths below are relative to the repository and refer to the pinned commit. Permanent source links use `https://github.com/luchiansienna/QuantEngine/blob/252b790333fb685a45287ca75b973d6399ff337a/<path>`.

| Behavior | Primary evidence |
|---|---|
| Navigation and bond UI | `apps/quant-dashboard/src/App.tsx`, `CurvePanel.tsx` |
| Bond valuation and curve conventions | `apps/QuantCli/main.cpp`, `QuantEngine/src/fixed_income/{Bond,Discounting,Duration,DV01,Convexity,YieldCurve,RateScenarioEngine}.cpp` |
| Option calculation and dividend gap | `apps/quant-dashboard/src/OptionsWorkbench.tsx`, `apps/QuantWebApi/OptionAnalysisRequest.cs`, `QuantEngineClient.cs`, `apps/QuantCli/main.cpp`, `QuantEngine/src/pricing/{BlackScholes,ImpliedVolatility}.cpp` |
| IBKR data | `apps/QuantWebApi/MarketData/{IbkrMarketDataClient,IbkrStockHistory}.cs`, `Program.cs` |
| Catalog, validation and cache | `apps/QuantWebApi/Strategies/{StockStrategyCatalog,StockModels,StockHistoryStore,StockStrategyEndpoints}.cs` |
| Strategy rules, costs and results | `QuantEngine/include/quant/strategies/Strategies.h`, `QuantEngine/src/strategies/MovingAverageBacktest.cpp`, `apps/quant-dashboard/src/{StockWorkbench.tsx,stockTypes.ts}` |
| Frontier and imports | `apps/quant-dashboard/src/{PortfolioWorkbench.tsx,portfolio.ts}`, `apps/quant-dashboard/README.md` |
| Risk/credit calculations | `QuantEngine/src/risk/RiskAnalytics.cpp`, `apps/QuantWebApi/Risk/{RiskRequests,RiskEndpoints}.cs`, `apps/quant-dashboard/src/RiskWorkbench.tsx` |
| Reconciliation and CSV | `apps/QuantWebApi/Risk/ExposureReconciliation.cs`, `apps/quant-dashboard/src/riskCsv.ts` |
| Worker contract and errors | `apps/QuantWebApi/{Program,QuantEngineClient}.cs`, `apps/QuantCli/{main.cpp,RiskCommands.h,BacktestCommand.h}` |
| Native-only capabilities | `QuantEngine/src/fixed_income/{YieldToMaturity,PortfolioRisk}.cpp`, `apps/QuantConsole/main.cpp` |

Existing verification assets include C++ Black–Scholes/risk/strategy tests, StockApiHarness and RiskApiHarness, dashboard portfolio/catalog tests, and risk API/CSV check scripts. Their presence is evidence of verification support, not a report that they passed in this inspection.
