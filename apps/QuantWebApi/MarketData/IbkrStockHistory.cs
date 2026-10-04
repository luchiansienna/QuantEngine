using System.Collections.Concurrent;
using System.Globalization;
using IBApi;
using QuantWebApi.Strategies;

namespace QuantWebApi.MarketData;

public sealed partial class IbkrMarketDataClient
{
    private readonly ConcurrentDictionary<int, HistoricalRequest> _historyRequests = new();

    public async Task<StockHistory> GetStockHistoryAsync(StockHistoryRequest request, CancellationToken ct)
    {
        request.Validate();
        await EnsureConnectedAsync(ct);
        var contractId = NextRequestId();
        var resolution = new ContractRequest();
        _contractRequests[contractId] = resolution;
        Contract contract;
        try
        {
            _client!.reqContractDetails(contractId, new Contract {
                Symbol = request.NormalizedSymbol, SecType = "STK", Currency = "USD",
                Exchange = "SMART", PrimaryExch = request.NormalizedExchange
            });
            await resolution.Completed.Task.WaitAsync(TimeSpan.FromSeconds(_options.SnapshotTimeoutSeconds), ct);
            if (resolution.Contracts.Count != 1)
                throw new IbkrException("Stock contract is missing or ambiguous. Check the symbol and primary listing exchange.");
            contract = resolution.Contracts[0];
            if (contract.SecType != "STK" || contract.Currency != "USD")
                throw new IbkrException("This workbench supports USD stocks only.");
            contract.Exchange = "SMART";
        }
        finally { _contractRequests.TryRemove(contractId, out _); }

        var id = NextRequestId();
        var pending = new HistoricalRequest();
        _historyRequests[id] = pending;
        var client = _client!;
        try
        {
            // Same adjustment basis for open and close. No streaming or orders.
            //client.reqHistoricalData(id, contract, "", $"{request.Years} Y", "1 day", "TRADES", 1, 1, false, []);
            var endDateTime = DateTime.UtcNow
                .AddMinutes(-20)
                .ToString("yyyyMMdd-HH:mm:ss", CultureInfo.InvariantCulture);
            _logger.LogInformation(
                "Historical request {RequestId}: End={End}, NowUtc={NowUtc}",
                id,
                endDateTime,
                DateTime.UtcNow);
            client.reqHistoricalData(
                id,
                contract,
                endDateTime,
                $"{request.Years} Y",
                "1 day",
                "TRADES",
                1,
                1,
                false,
                []);
            await pending.Completed.Task.WaitAsync(TimeSpan.FromSeconds(Math.Max(60, _options.SnapshotTimeoutSeconds)), ct);
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(
                DateTimeOffset.UtcNow, "America/New_York").DateTime);
            var bars = pending.Bars.Where(b => DateOnly.ParseExact(b.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture) < today)
                .OrderBy(b => b.Date, StringComparer.Ordinal).ToArray();
            if (bars.Length < 3) throw new IbkrException("IBKR returned too few completed daily bars. Check the listing, data permissions and requested history.");
            if (bars.Select(b => b.Date).Distinct().Count() != bars.Length)
                throw new IbkrException("IBKR returned duplicate daily bars. Reload the historical dataset.");
            return new StockHistory(Guid.NewGuid().ToString("N"), contract.Symbol, request.NormalizedExchange,
                contract.ConId, "USD", DateTimeOffset.UtcNow, "IBKR TWS · daily TRADES · regular hours",
                "Split-adjusted prices; cash dividends excluded. Current New York date excluded.", bars);
        }
        catch (TimeoutException e) { throw new TimeoutException("IBKR did not finish sending daily history. Check TWS connectivity and historical market-data subscriptions.", e); }
        finally
        {
            _historyRequests.TryRemove(id, out _);
            try { client.cancelHistoricalData(id); }
            catch (Exception e) { _logger.LogDebug(e, "Could not cancel historical request {RequestId}", id); }
        }
    }

    private void HandleHistoricalBar(object?[] arguments)
    {
        if (arguments.Length < 2 || arguments[0] is not int id ||
            !_historyRequests.TryGetValue(id, out var pending)) return;
        try
        {
            if (arguments[1] is not Bar bar || !DateOnly.TryParseExact(bar.Time, "yyyyMMdd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                !double.IsFinite(bar.Open) || !double.IsFinite(bar.Close) ||
                bar.Open < 1e-6 || bar.Close < 1e-6 || bar.Open > 1e9 || bar.Close > 1e9)
                throw new IbkrException("IBKR returned an invalid daily bar.");
            if (pending.Bars.Count >= 5000) throw new IbkrException("Historical response exceeds 5000 bars.");
            pending.Bars.Enqueue(new StockBar(date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), bar.Open, bar.Close));
        }
        catch (Exception e) { pending.Completed.TrySetException(e); }
    }
    private sealed class HistoricalRequest
    {
        public ConcurrentQueue<StockBar> Bars { get; } = new();
        public TaskCompletionSource Completed { get; } = NewCompletionSource();
    }
}
