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
    double Allocation = .95, double FeeBps = 5, double SlippageBps = 5,
    Dictionary<string, double>? Parameters = null)
{
    private Dictionary<string, double> ResolvedParameters()
    {
        var algorithm = StockStrategyCatalog.Algorithms.FirstOrDefault(a => a.Id == Algorithm)
            ?? throw new ArgumentException("Unsupported algorithm.");
        if (Parameters is not null && Parameters.Keys.Any(key => !algorithm.Parameters.Any(p => p.Key == key)))
            throw new ArgumentException("Unknown strategy parameter.");
        var values = new Dictionary<string, double>();
        foreach (var p in algorithm.Parameters)
        {
            var fallback = p.Key == "fastWindow" ? FastWindow : p.Key == "slowWindow" ? SlowWindow : p.Default;
            var value = Parameters is not null && Parameters.TryGetValue(p.Key, out var supplied) ? supplied : fallback;
            if (!double.IsFinite(value) || value < p.Min || value > p.Max ||
                (p.Step == 1 && value != Math.Floor(value)))
                throw new ArgumentException($"Invalid parameter: {p.Key}.");
            values.Add(p.Key, value);
        }
        return values;
    }
    public void Validate(int bars)
    {
        var p = ResolvedParameters();
        var warmup = Algorithm switch {
            "sma-long-cash" => p["slowWindow"],
            "momentum-long-cash" => p["lookback"] + 1,
            "martingale-long-cash" => 1,
            _ => Math.Max(p["trendWindow"], p["rsiPeriod"] + 1)
        };
        if (Algorithm == "sma-long-cash" && p["fastWindow"] >= p["slowWindow"])
            throw new ArgumentException("Require fast SMA < slow SMA.");
        if (Algorithm == "rsi-mean-reversion" && p["entryBelow"] >= p["exitAbove"])
            throw new ArgumentException("Require entry RSI < exit RSI.");
        if (Algorithm == "martingale-long-cash" && p["baseStakePct"] > Allocation * 100 + 1e-10)
            throw new ArgumentException("Base stake must not exceed Maximum stake (%).");
        if (bars <= warmup || bars > 5000) throw new ArgumentException("Not enough bars for strategy warm-up, or more than 5000 bars.");
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
        var parameters = ResolvedParameters();
        var catalog = StockStrategyCatalog.Algorithms.Single(a => a.Id == Algorithm);
        return $"stock-backtest-v2 {Algorithm} {parameters.Count} " +
            string.Join(" ", catalog.Parameters.Select(p => N(parameters[p.Key]))) +
            $" {N(InitialCash)} {N(Allocation)} {N(FeeBps)} {N(SlippageBps)} {bars.Count} " +
            string.Join(" ", bars.Select(b => $"{b.Date} {N(b.Open)} {N(b.Close)}"));
    }
}
