namespace QuantEngine.Fundamentals;

// Flows cover PeriodStart..PeriodEnd; balances are at PeriodEnd.
public sealed record FinancialStatement(
    string Symbol, string Currency, DateOnly PeriodStart, DateOnly PeriodEnd, DateOnly PublishedOn,
    double? Revenue = null, double? GrossProfit = null, double? OperatingIncome = null,
    double? NetIncome = null, double? OperatingCashFlow = null, double? CapitalExpenditure = null,
    double? TotalAssets = null, double? TotalEquity = null, double? TotalDebt = null,
    double? Cash = null, double? CurrentAssets = null, double? CurrentLiabilities = null,
    double? DilutedShares = null);

public sealed record FundamentalsRequest(DateOnly AsOf, FinancialStatement Current,
    FinancialStatement? PriorYear = null, double? MarketCapitalization = null);
public sealed record Factor(double? Value, string? UnavailableReason = null);
public sealed record FundamentalsResult(string Symbol, string Currency, DateOnly AsOf,
    DateOnly PeriodStart, DateOnly PeriodEnd, DateOnly PublishedOn, IReadOnlyDictionary<string, Factor> Factors);

public static class InputRules
{
    public static void Identity(string? symbol, string? currency)
    {
        if (string.IsNullOrWhiteSpace(symbol) || symbol.Length > 32 ||
            currency is null || currency.Length != 3 || currency.Any(c => c < 'A' || c > 'Z'))
            throw new ArgumentException("A symbol and uppercase three-letter currency are required.");
    }
    public static void Number(double? value, string name, bool nonnegative = false)
    {
        if (value is double n && (!double.IsFinite(n) || Math.Abs(n) > 1e24 || (nonnegative && n < 0)))
            throw new ArgumentException($"{name} must be finite, within +/-1e24, and obey its sign convention.");
    }
    public static Factor Ratio(double? numerator, double? denominator, bool absoluteBase = false)
    {
        if (numerator is null || denominator is null) return new(null, "Missing input.");
        var divisor = absoluteBase ? Math.Abs(denominator.Value) : denominator.Value;
        if (divisor <= 0) return new(null, "Requires a positive denominator.");
        var value = numerator.Value / divisor;
        return double.IsFinite(value) ? new(value) : new(null, "Result exceeds numeric range.");
    }
}
