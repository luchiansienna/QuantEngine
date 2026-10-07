# Stock strategy integration

The dashboard reads strategy descriptions, parameter bounds and defaults from
`GET /api/strategies`. The catalog includes SMA long/cash, time-series momentum
long/cash, and RSI mean reversion. A stale API catalog displays a retryable error
instead of crashing the React page.

Backtest requests use `algorithm` and a `parameters` object, plus execution
settings and a cached `datasetId`. For example:

```json
{
  "datasetId": "value-from-history-response",
  "algorithm": "momentum-long-cash",
  "parameters": { "lookback": 126 },
  "initialCash": 10000,
  "allocation": 0.95,
  "feeBps": 5,
  "slippageBps": 5
}
```

The API validates parameters before sending the versioned `stock-backtest-v2`
protocol to QuantCli. Legacy SMA requests with `fastWindow` and `slowWindow`,
the original native stream protocol, and the CSV backtest command remain supported.

All strategies decide at the close and execute at the next open. The benchmark
enters at the first eligible execution session with the same allocation and entry
costs. Results include `warmupBars`, used to exclude warm-up sessions from metrics.
Cash dividends, cash interest and taxes are excluded.

## Applying the update

Rebuild **QuantCli and QuantWebApi**, point `QuantEngine:ExecutablePath` at the
rebuilt QuantCli executable, and restart the API process. Restart the Vite server
and reload the dashboard. Updating only React leaves the old catalog running and
cannot enable the new strategies.

Vite proxies to `http://localhost:51596` by default. Set `QUANT_API_URL` before
starting Vite to use another API instance for isolated verification.

## Verification

- Dashboard: `npm ci`, `npm run build`, `npm test`, and `npm run lint` in
  `apps/quant-dashboard`.
- Native: configure CMake with `BUILD_TESTING=ON`, build, then run CTest.
- API contract and native integration:
  `dotnet run --project tests/StockApiHarness -- <path-to-QuantCli>`.
- Full API build requires the installed IBKR CSharpAPI DLL configured through
  `IBKR_API_PATH` or `QuantWebApi.local.props`.

The API harness uses synthetic bars and does not connect to TWS or submit orders.
