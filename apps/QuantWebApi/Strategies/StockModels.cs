using System.Globalization;
using System.Text.RegularExpressions;

namespace QuantWebApi.Strategies;

public sealed record StockHistoryRequest(string Symbol = "AAPL", string PrimaryExchange = "NASDAQ", int Years = 1)
{
    public string NormalizedSymbol => (Symbol ?? "").Trim().ToUpperInvariant();
    public string NormalizedExchange => (PrimaryExchange ?? "").Trim().ToUpperInvariant();
    public void Validate()
    {
        if (!Regex.IsMatch(NormalizedSymbol, @"^[A-Z][A-Z0-9. -]{0,14}$") ||
            NormalizedExchange is not ("NASDAQ" or "NYSE" or "ARCA" or "AMEX") || Years is < 1 or > 5)
            throw new ArgumentException("Provide a stock symbol, primary exchange (for example NASDAQ or NYSE), and 1–5 years.");
    }
}
public sealed record StockBar(string Date, double Open, double Close);
public sealed record StockHistory(string DatasetId, string Symbol, string PrimaryExchange, int ContractId,
    string Currency, DateTimeOffset FetchedAt, string Source, string PriceBasis, IReadOnlyList<StockBar> Bars);
public sealed record StockBacktestRequest(string DatasetId, string Algorithm = "sma-long-cash",
    int FastWindow = 20, int SlowWindow = 50, double InitialCash = 10000,
    double Allocation = .95, double FeeBps = 5, double SlippageBps = 5)
{
    public void Validate(int bars)
    {
        if (Algorithm != "sma-long-cash") throw new ArgumentException("Unsupported algorithm.");
        if (FastWindow < 1 || SlowWindow <= FastWindow || SlowWindow > 500 || bars <= SlowWindow)
            throw new ArgumentException("Require 1 ≤ fast < slow ≤ 500, with more bars than the slow window.");
        if (!double.IsFinite(InitialCash) || InitialCash < 1 || InitialCash > 1e9 ||
            !double.IsFinite(Allocation) || Allocation <= 0 || Allocation > 1 ||
            !double.IsFinite(FeeBps) || FeeBps < 0 || FeeBps > 1000 ||
            !double.IsFinite(SlippageBps) || SlippageBps < 0 || SlippageBps > 1000)
            throw new ArgumentException("Invalid capital, allocation or trading costs.");
    }
    public string ToCommand(IReadOnlyList<StockBar> bars)
    {
        Validate(bars.Count);
        var previous = "";
        foreach (var b in bars)
        {
            if (!DateOnly.TryParseExact(b.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) ||
                string.CompareOrdinal(b.Date, previous) <= 0 || !double.IsFinite(b.Open) || !double.IsFinite(b.Close) ||
                b.Open < 1e-6 || b.Close < 1e-6 || b.Open > 1e9 || b.Close > 1e9)
                throw new ArgumentException("Invalid or unordered historical bars.");
            previous = b.Date;
        }
        static string N(double n) => n.ToString("R", CultureInfo.InvariantCulture);
        return $"stock-backtest {FastWindow} {SlowWindow} {N(InitialCash)} {N(Allocation)} {N(FeeBps)} {N(SlippageBps)} {bars.Count} " +
            string.Join(" ", bars.Select(b => $"{b.Date} {N(b.Open)} {N(b.Close)}"));
    }
}
