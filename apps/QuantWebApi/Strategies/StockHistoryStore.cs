using Microsoft.Extensions.Caching.Memory;
using QuantWebApi.MarketData;

namespace QuantWebApi.Strategies;

// Bounded, ephemeral datasets. Parameter tweaks reuse the exact same data for 30 minutes.
public sealed class StockHistoryStore(IbkrMarketDataClient ibkr) : IDisposable
{
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 32 });
    private readonly SemaphoreSlim _gate = new(1, 1);
    private DateTimeOffset _nextRequest = DateTimeOffset.MinValue;

    public StockHistory? Find(string id) =>
        Guid.TryParseExact(id, "N", out _) ? _cache.Get<StockHistory>(id) : null;

    public async Task<StockHistory> LoadAsync(StockHistoryRequest request, CancellationToken cancellationToken)
    {
        request.Validate();
        if (!await _gate.WaitAsync(0, cancellationToken))
            throw new HistoryBusyException("An IBKR history request is already running. Try again when it completes.");
        try
        {
            if (DateTimeOffset.UtcNow < _nextRequest)
                throw new HistoryBusyException("Wait 15 seconds between IBKR history downloads. Parameter changes can reuse loaded data.");
            _nextRequest = DateTimeOffset.UtcNow.AddSeconds(15);
            var history = await ibkr.GetStockHistoryAsync(request, cancellationToken);
            _cache.Set(history.DatasetId, history, new MemoryCacheEntryOptions
            {
                Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(30)
            });
            return history;
        }
        finally { _gate.Release(); }
    }
    public void Dispose() { _cache.Dispose(); _gate.Dispose(); }
}
public sealed class HistoryBusyException(string message) : Exception(message);
