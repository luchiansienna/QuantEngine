using System.Globalization;

namespace QuantWebApi.Risk;

public sealed record ForwardTrade(double Quantity, double Strike);
public sealed record RiskRequest(
    double Spot, double Rate, double DividendYield, double Volatility,
    double Maturity, double Confidence, double PhysicalDrift, int HorizonDays,
    double Collateral, double HazardRate, double Recovery, int Paths, int Steps,
    uint Seed, List<ForwardTrade>? Trades)
{
    public string ToCommand()
    {
        RiskInput.Range(Spot, .0001, 1e6, nameof(Spot));
        RiskInput.Range(Rate, -.1, .5, nameof(Rate));
        RiskInput.Range(DividendYield, 0, .5, nameof(DividendYield));
        RiskInput.Range(Volatility, 0, 2, nameof(Volatility));
        RiskInput.Range(Maturity, .01, 30, nameof(Maturity));
        RiskInput.Range(Confidence, .5, .9999, nameof(Confidence));
        RiskInput.Range(PhysicalDrift, -.5, .5, nameof(PhysicalDrift));
        RiskInput.Range(HorizonDays, 1, 252, nameof(HorizonDays));
        RiskInput.Range(Collateral, 0, 1e12, nameof(Collateral));
        RiskInput.Range(HazardRate, 0, 5, nameof(HazardRate));
        RiskInput.Range(Recovery, 0, 1, nameof(Recovery));
        RiskInput.Range(Paths, 100, 100000, nameof(Paths));
        RiskInput.Range(Steps, 1, 120, nameof(Steps));
        if ((long)Paths * Steps > 2000000) throw new ArgumentException("Paths × steps cannot exceed 2,000,000.");
        if (HorizonDays / 252.0 > Maturity) throw new ArgumentException("VaR horizon cannot exceed maturity.");
        if (Trades is not { Count: > 0 and <= 100 }) throw new ArgumentException("Supply 1 to 100 forward trades.");
        var values = new List<double> { Spot, Rate, DividendYield, Volatility, Maturity, Confidence,
            PhysicalDrift, HorizonDays, Collateral, HazardRate, Recovery, Paths, Steps, Seed, Trades.Count };
        foreach (var trade in Trades)
        {
            if (trade is null) throw new ArgumentException("A trade cannot be null.");
            RiskInput.Range(trade.Quantity, -1e8, 1e8, "Quantity");
            RiskInput.Range(trade.Strike, .0001, 1e6, "Strike");
            values.Add(trade.Quantity); values.Add(trade.Strike);
        }
        return "risk " + RiskInput.Numbers(values);
    }
}
public sealed record CreditBondRequest(double Face, double Coupon, double Maturity, int Frequency,
    double Rate, double HazardRate, double Recovery)
{
    public string ToCommand()
    {
        RiskInput.Range(Face, .01, 1e12, nameof(Face)); RiskInput.Range(Coupon, 0, 1, nameof(Coupon));
        RiskInput.Range(Maturity, .01, 30, nameof(Maturity)); RiskInput.Range(Rate, -.1, .5, nameof(Rate));
        RiskInput.Range(HazardRate, 0, 5, nameof(HazardRate)); RiskInput.Range(Recovery, 0, 1, nameof(Recovery));
        if (Frequency is not (1 or 2 or 4 or 12) || Maturity * Frequency < 1 ||
            Math.Abs(Maturity * Frequency - Math.Round(Maturity * Frequency)) > 1e-8)
            throw new ArgumentException("Use 1, 2, 4 or 12 payments/year and whole coupon periods.");
        return "credit-bond " + RiskInput.Numbers([Face, Coupon, Maturity, Frequency, Rate, HazardRate, Recovery]);
    }
}
public sealed record HistoricalVarRequest(double Confidence, int HorizonDays, List<double>? Pnl)
{
    public string ToCommand()
    {
        RiskInput.Range(Confidence, .5, .9999, nameof(Confidence));
        RiskInput.Range(HorizonDays, 1, 252, nameof(HorizonDays));
        if (Pnl is not { Count: > 0 and <= 100000 }) throw new ArgumentException("Supply 1 to 100,000 P&L observations.");
        foreach (var x in Pnl) RiskInput.Range(x, -1e15, 1e15, "P&L");
        return "historical-var " + RiskInput.Numbers(new[] { Confidence }.Concat(Pnl));
    }
}
internal static class RiskInput
{
    internal static string Numbers(IEnumerable<double> values) => string.Join(" ", values.Select(x => x.ToString("R", CultureInfo.InvariantCulture)));
    internal static void Range(double x, double min, double max, string name)
    {
        if (!double.IsFinite(x) || x < min || x > max) throw new ArgumentException($"{name} must be between {min} and {max}.");
    }
}
