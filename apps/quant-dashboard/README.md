# Quant Dashboard

React and TypeScript working surface for the native QuantEngine. Instrument and strategy calculations use C++ through the ASP.NET Core API and Vite proxy. The multi-asset portfolio workbench estimates covariance and solves its small allocation problems in TypeScript in the browser.

## Run locally

Start `QuantWebApi` first on `http://localhost:51596`, with `QuantCli.exe` configured as described in `../QuantWebApi/README.md`.

Then run:

```powershell
cd apps\quant-dashboard
npm install
npm run dev
```

Open `http://localhost:5173`. The development server proxies `/api` requests to the ASP.NET Core API, so no development CORS policy is required.

Run `npm run build` to create the production bundle in `dist/`.

## Fundamentals and investor expectations

The **Fundamentals** and **Investor expectations** navigation buttons open forms
that call the equity analysis API directly. Start the updated API and dashboard
as above, open either tab, and select **Run analysis** to try the prefilled sample.
No PowerShell requests or native pricing worker are needed for these two analyses.
The full API still requires its existing IBKR DLL configuration to build.

- Fundamentals accepts statement dates, financial figures and optional market
  capitalization. Enable the prior-year comparison for year-over-year growth.
- Investor expectations accepts analyst rows with dated EPS estimates and optional
  price targets. Add or remove analysts, and optionally enable previous-consensus
  comparison and reported earnings. Supply a spot price for target upside.
- Use **Load sample / reset** to restore the examples. Blank optional numbers are
  sent as null; required EPS cannot be blank. Missing or undefined factors display
  their reason. Changing inputs marks existing results as needing a rerun; failed
  requests clear the previous result and display the API's validation message.

These are manual-input research forms; they do not fetch statements or analyst
estimates automatically. Values use consistent currency and share units. Returns
are not annualized, and target upside is not a forecast. Full formulas and API
contracts are in [equity-analysis.md](../../docs/equity-analysis.md).

If the API runs on a different port, set `QUANT_API_URL` before starting Vite:

```powershell
$env:QUANT_API_URL = 'http://localhost:5080'
npm run dev
```

## Portfolio frontier

Open **Portfolio frontier** to analyse 2–8 holdings. The initial list includes ADBE, SPY, TSLA, AMZN, ANET and AMD with their primary exchanges. Load 1–5 years from the existing IBKR history endpoint, or select multiple JSON files exported from Stock strategies. Choose **Strategy equity curves** before importing to optimise the historical strategies instead of stock prices. A new import replaces the previous set.

All series must use the same currency and have at least 61 common observations. The workbench trims differing endpoints and rejects missing sessions inside the shared range. Price histories preserve the API's price-basis description; split-adjusted prices excluding dividends produce price returns, not total returns.

Daily simple returns produce annual arithmetic means (`mean × 252`) and unbiased sample covariance (`covariance × 252`). The deterministic long-only optimiser enumerates active asset supports and solves the equality-constrained minimum-variance problem for 81 target returns from the global minimum-variance portfolio to the highest asset mean. Weights sum to one. A 1e-10 diagonal stabiliser handles singular covariance; risk metrics use the original covariance. Best Sharpe is the best of these sampled frontier portfolios, not a continuous tangency solution.

Click a frontier point, use the accessible slider, or choose minimum variance/equal weights/best sampled Sharpe. The selected weights, annual volatility, estimated annual return, Sharpe and covariance matrix update together. The annual risk-free input defaults to 0%; select a benchmark consistent with the currency and historical period. Sharpe uses annual arithmetic excess return divided by annual volatility.

Historical estimates are not forecasts. Fixed-weight risk assumes rebalancing; additional rebalancing costs, inflation and currency conversion are excluded. Imported equity curves already include their own simulated costs. This view places no orders and does not infer covariance from summary cards.

Run `npm test` for numerical and import-validation tests; `npm run lint` and `npm run build` check the dashboard.
