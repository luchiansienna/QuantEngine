# Credit and market risk workbench

Implemented on QuantEngine main `8767f09252b9efe2b01b3bfaa1eb712ab0568263`.
The new **Credit & market risk** tab uses the existing React → ASP.NET Core → persistent C++ worker architecture. Reconciliation runs in .NET. No IBKR connection is required by the risk calculations; the existing full API project still requires its IBKR SDK reference to build.

## Included capabilities

| Screen | What it calculates |
| --- | --- |
| PFE, CVA & Monte Carlo VaR | Time profiles of expected exposure and percentile exposure for signed equity forwards, unilateral CVA, clean/adjusted value, market VaR and expected shortfall |
| Credit bond pricing | Defaultable coupon-bond value with survival-weighted cash flows and recovery of par paid at default |
| Historical VaR | Empirical loss quantile and expected shortfall from supplied scenario P&Ls |
| Exposure reconciliation | CSV import, key matching, duplicate/missing/context/value breaks, tolerance comparison and full JSON report |

This release is an educational implementation with explicit assumptions. It is not a calibrated bank production model, regulatory PFE add-on, capital calculation, or a claim of production reconciliation experience.

## Install complete changed files

The accompanying ZIP contains complete files in their repository-relative paths, not a patch. `CHANGED_FILES.txt` lists them and `BASE_FILE_SHA256.json` records the base hashes.

1. Commit or back up local changes. These files are based on the GitHub commit above; compare overlapping local changes before replacing files.
2. Extract into a temporary directory. Copy the contents of `files/` into the QuantEngine root, preserving directories. Do not replace your IBKR local props or appsettings; neither is included.
3. Reconfigure/rebuild **QuantCli** so the new `risk`, `credit-bond`, and `historical-var` commands exist. Stop the running API before replacing its native worker executable.
4. Run the existing API with your current `QuantEngine:ExecutablePath` pointing at the rebuilt worker and your existing IBKR DLL setup.
5. In `apps/quant-dashboard`, run `npm ci`, then `npm run dev`. Open `http://localhost:5173` and select **Credit & market risk**. The existing Vite proxy targets API port 51596.

Example CMake build from the repository root (Visual Studio generator):

```powershell
cmake -S . -B out/build/risk -DBUILD_TESTING=OFF
cmake --build out/build/risk --config Debug --target QuantCli
```

The executable for this example is normally `out/build/risk/apps/QuantCli/Debug/QuantCli.exe`. Use the path produced by your generator in the existing API configuration. You can instead rebuild your existing Visual Studio CMake configuration.

Run the existing API and React development server in separate terminals:

```powershell
dotnet run --project apps/QuantWebApi
```

```powershell
cd apps/quant-dashboard
npm ci
npm run dev
```

The legacy `apps/QuantWebApi/wwwroot` bond-only page is not the React dashboard. Use port 5173 for these new screens. For a deployment serving React via ASP.NET static files, publish the dashboard's `dist` contents using your existing deployment process.

## Models and conventions

All API rates and probabilities use decimals, e.g. 0.20 = 20%. The UI converts percent fields. Monetary values use one user-specified currency; no FX conversion occurs. Time is in years and VaR trading-day horizons use 252 days/year.

### Forward valuation, exposure and PFE

All forwards share an underlying, currency, maturity and netting set. Each trade contains signed underlying units `q_j` and strike `K_j`.

```
V(t) = Σ q_j [ S(t) exp(-d (T-t)) - K_j exp(-r (T-t)) ]
E(t) = max(V(t) - C, 0)
EE(t) = mean over paths of E(t)
PFE_p(t) = empirical p-quantile of E(t)
```

Net values are summed **before** applying the positive part. `C` is fixed received collateral, with no margin calls, interest, haircut or margin period of risk. Netting is assumed legally enforceable. Do not combine unrelated counterparties in one simulation.

For exposure/CVA, exact GBM steps use the risk-neutral measure Q:

```
S(t+dt) = S(t) exp[(r-d-σ²/2)dt + σ sqrt(dt) Z]
```

The output includes time zero and the chosen evenly spaced dates. Final exposure is immediately **before settlement**; after final settlement it is zero. Peak PFE is the maximum percentile over the reported dates, including today. PFE is exposure, not expected default loss. A percentile is not a maximum.

### CVA and credit pricing

Flat risk-neutral hazard `λ` gives survival `Q(t)=exp(-λt)` and cumulative default probability `1-Q(t)`. An input hazard of 2% implies a one-year PD of approximately 1.9801%, not exactly 2%.

```
CVA ≈ (1-R) Σ exp(-r t_i) EE(t_i) [Q(t_(i-1))-Q(t_i)]
Adjusted value = clean value - CVA
```

This is unilateral CVA with independent default/exposure, fixed recovery and right-endpoint exposure quadrature. Increase time steps to examine discretization sensitivity. No DVA, FVA, wrong-way risk, hazard calibration or term structures are included. The final time bucket uses pre-settlement exposure.

Credit-bond pricing uses survival-weighted coupons/principal plus recovery paid at the actual default time:

```
Risky bond = Σ CF_i exp[-(r+λ)t_i] + R F λ ∫[0,T] exp[-(r+λ)t] dt
```

The recovery integral is evaluated analytically, with a stable zero-limit case. Bonds are valued on a coupon date with no accrued interest and require whole coupon periods. No stub coupons, calendar/day-count convention, amortization or accrued-interest recovery. Recovery of par can make a particular bond's credit adjustment negative under unusual rate/recovery combinations; the code does not clamp it.

### Market VaR and expected shortfall

Monte Carlo market VaR uses a **separate physical-measure total-return drift μ**:

```
S(h) = S(0) exp[(μ-d-σ²/2)h + σ sqrt(h) Z]
Loss = V(0) - V(h)
```

The portfolio is fully revalued at the horizon, which cannot exceed maturity. This is undiscounted mark-to-market P&L without funding/carry adjustment. Exposure simulation and market simulation have separate random streams. This release models the forward portfolio, not the existing option/bond holdings as a cross-asset portfolio.

Historical VaR takes supplied **scenario P&Ls**, converts profit to negative loss, then applies the same loss statistics. P&Ls must represent the same portfolio/currency/horizon. The horizon labels the observations; it does not scale them or aggregate daily observations. Prefer historical revaluation of today's portfolio over raw realized P&Ls of changing positions.

Both PFE and VaR use the inverse empirical CDF: sorted observation at one-based rank `ceil(p*N)`. ES is the average over exactly the worst `(1-p)*N` observation mass, weighting the boundary observation fractionally. This avoids changing tail probability when there are ties. Negative VaR is retained, since a negative loss means a gain. High confidence with few observations produces a sparse tail estimate.

The seed reproduces results for the same native build. C++ standard normal generation is implementation-dependent across compilers/platforms; the seed is not a cross-platform reproducibility guarantee.

## Reconciliation workflow

1. Calculate a forward portfolio and export **engine exposures CSV**.
2. Load this CSV as the engine source and a reporting CSV with the same schema as the reporting source.
3. Select tolerances and reconcile; inspect statuses and export the full JSON report.
4. For a demonstration, **Load illustrative breaks** supplies one of each status: matched, value break, missing from engine, missing from reporting, context mismatch, duplicate.

CSV header, in exact order:

```csv
tradeId,counterparty,nettingSet,asOf,currency,metric,tenor,confidence,modelVersion,scenarioId,value
```

- Keys: trade ID, counterparty, netting set, metric (`EE` or `PFE`), tenor. IDs are case-sensitive and cannot contain surrounding whitespace/control characters. Export uses `NETTING-SET` as the trade ID to denote an aggregate.
- Comparison context: ISO as-of date, currency, confidence, model version and scenario snapshot. Any disagreement blocks numerical comparison. No silent FX conversion or date alignment.
- Duplicate keys are reported with every source row retained; they are not overwritten or aggregated. Submit one snapshot/confidence per key in each run.
- Difference = reporting − engine. Pass when `abs(difference) <= max(absoluteTolerance, relativeTolerance * abs(engine))`.
- Missing values are not zero. An empty source produces missing-source breaks against nonempty input. Both empty arrays produce an empty report.
- Exported scenario IDs are SHA-256 hashes of all numeric/trade simulation inputs and model version. They allow identical input snapshots to be recognized; they are not market-data lineage or calibrated scenario identifiers.
- CSV quotes, commas and escaped quotes are supported. Decimal tenor is used by .NET; export rounds year fractions to 10 decimal places for stable joins. Imported files must agree on tenor conventions.
- Limits: 10,000 rows/source, 10 MB/file in the UI; the table displays 500 keys and JSON exports all keys. Reconciliation results live in memory until downloaded; no database, scheduled batch jobs or live reporting connector is added.

This exercises the reconciliation workflow; diagnosis still requires checking trade mapping, market-data snapshots, netting/collateral conventions, valuation timing and model versions.

## API routes

| POST route | Request type |
| --- | --- |
| `/api/risk/analyse` | `RiskRequest` |
| `/api/risk/credit-bond` | `CreditBondRequest` |
| `/api/risk/historical-var` | `HistoricalVarRequest` |
| `/api/risk/reconcile` | `ReconciliationRequest` |

The three native routes reuse the existing worker lock, timeout, cancellation and restart behavior. Invalid numeric ranges return 400; worker timeout returns 504. Simulation work is capped at 2,000,000 path-steps, 100,000 paths, 120 steps and 100 forwards. Historical inputs allow at most 100,000 observations. The HTTP request-size limit also applies.

## Validation

The included tests cover analytical benchmarks, limits and integration behavior:

- `tests/RiskAnalyticsTests.cpp`: 29 native checks, including analytic lognormal PFE/EE benchmarks, zero hazard, recovery integral, deterministic paths, offsetting trades, collateral, empirical VaR/ES and rejected inputs.
- `tests/RiskApiHarness`: 28 C# validation/reconciliation checks. Links the real risk endpoints, models and worker client without requiring an IBKR DLL.
- `scripts/check-risk-api.py`: 17 HTTP/native-worker checks including concurrent requests with distinct seeds, input rejection and deterministic reruns.
- `scripts/check-risk-csv.mjs`: 11 CSV parsing and roundtrip checks.
- React production build passes; lint has one existing `CurvePanel.tsx` Fast Refresh warning.
- Browser checks passed against the real risk API/native worker: all calculation tabs, engine CSV export/import (26 matched keys), all six reconciliation statuses, and 390px mobile layout.
- Native protocol smoke checks cover the existing bond and option commands plus all three new commands.

Run the C# checks:

```powershell
dotnet run --project tests/RiskApiHarness
```

Run an IBKR-independent risk API for testing (set your native executable path):

```powershell
$env:QuantEngine__ExecutablePath = "C:\QUANT\QuantEngine\out\build\risk\apps\QuantCli\Debug\QuantCli.exe"
dotnet run --project tests/RiskApiHarness -- --serve --urls http://localhost:51596
```

This test host exposes only the four risk routes. It is not the full app; the existing bond/options screens require the real API. In another terminal:

```powershell
python scripts/check-risk-api.py
node scripts/check-risk-csv.mjs
```

The C++ test is registered with CTest. Existing Catch2 tests still use the repository's existing FetchContent dependency; use `BUILD_TESTING=ON` when that dependency is available. The full API build and live IBKR integration must be verified with your local SDK/DLL configuration.
