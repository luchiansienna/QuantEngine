using QuantWebApi.MarketData;
using System.Text.Json;

namespace QuantWebApi.Strategies;

public static class StockStrategyEndpoints
{
    public static void MapStockStrategyEndpoints(this WebApplication app)
    {
        app.MapGet("/api/strategies", () => Results.Ok(new[] {
            new { id = "sma-long-cash", name = "Moving average · long / cash", assetClass = "Stocks" }
        }));
        app.MapPost("/api/market-data/stocks/history", async Task<IResult> (
            StockHistoryRequest request, StockHistoryStore store, CancellationToken ct) =>
        {
            try { return Results.Ok(await store.LoadAsync(request, ct)); }
            catch (ArgumentException e) { return Results.Problem(statusCode: 400, title: "Invalid stock request", detail: e.Message); }
            catch (HistoryBusyException e) { return Results.Problem(statusCode: 429, title: "History request limit", detail: e.Message); }
            catch (TimeoutException e) { return Results.Problem(statusCode: 504, title: "IBKR history timeout", detail: e.Message); }
            catch (IbkrException e) { return Results.Problem(statusCode: 502, title: "IBKR history unavailable", detail: e.Message); }
        });
        app.MapPost("/api/strategies/stocks/backtest", async Task<IResult> (
            StockBacktestRequest request, StockHistoryStore store, QuantEngineClient engine, CancellationToken ct) =>
        {
            var history = store.Find(request.DatasetId);
            if (history is null) return Results.Problem(statusCode: 410, title: "Historical dataset expired", detail: "Load IBKR history again; datasets are retained for up to 30 minutes.");
            try
            {
                var command = request.ToCommand(history.Bars);
                using var result = JsonDocument.Parse(await engine.BacktestStockAsync(command, ct));
                return Results.Ok(new { datasetId = history.DatasetId, symbol = history.Symbol,
                    currency = history.Currency, fetchedAt = history.FetchedAt, result = result.RootElement.Clone() });
            }
            catch (ArgumentException e) { return Results.Problem(statusCode: 400, title: "Invalid strategy inputs", detail: e.Message); }
            catch (TimeoutException e) { return Results.Problem(statusCode: 504, title: "Backtest timeout", detail: e.Message); }
        });
    }
}
