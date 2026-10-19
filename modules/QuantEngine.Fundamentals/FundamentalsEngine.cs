namespace QuantEngine.Fundamentals;

public static class FundamentalsEngine
{
    public static FundamentalsResult Analyse(FundamentalsRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (request.Current is null) throw new ArgumentException("Current statement is required.");
        var c = request.Current;
        Validate(c, request.AsOf);
        InputRules.Number(request.MarketCapitalization, "MarketCapitalization", true);
        if (request.PriorYear is { } p)
        {
            Validate(p, request.AsOf);
            if (p.Symbol != c.Symbol || p.Currency != c.Currency ||
                Math.Abs((c.PeriodEnd.DayNumber - p.PeriodEnd.DayNumber) - 365) > 14 ||
                Math.Abs((c.PeriodEnd.DayNumber - c.PeriodStart.DayNumber) -
                         (p.PeriodEnd.DayNumber - p.PeriodStart.DayNumber)) > 7)
                throw new ArgumentException("PriorYear must match symbol, currency, duration and the prior-year period.");
        }
        var fcf = c.OperatingCashFlow - c.CapitalExpenditure;
        var netDebt = c.TotalDebt - c.Cash;
        var factors = new Dictionary<string, Factor>
        {
            ["grossMargin"] = InputRules.Ratio(c.GrossProfit, c.Revenue),
            ["operatingMargin"] = InputRules.Ratio(c.OperatingIncome, c.Revenue),
            ["netMargin"] = InputRules.Ratio(c.NetIncome, c.Revenue),
            ["cashFlowMargin"] = InputRules.Ratio(c.OperatingCashFlow, c.Revenue),
            ["freeCashFlow"] = Amount(fcf),
            ["freeCashFlowMargin"] = InputRules.Ratio(fcf, c.Revenue),
            ["returnOnEndingAssets"] = InputRules.Ratio(c.NetIncome, c.TotalAssets),
            ["returnOnEndingEquity"] = InputRules.Ratio(c.NetIncome, c.TotalEquity),
            ["debtToEquity"] = InputRules.Ratio(c.TotalDebt, c.TotalEquity),
            ["currentRatio"] = InputRules.Ratio(c.CurrentAssets, c.CurrentLiabilities),
            ["netDebt"] = Amount(netDebt),
            ["dilutedEps"] = InputRules.Ratio(c.NetIncome, c.DilutedShares),
            ["earningsYield"] = InputRules.Ratio(c.NetIncome, request.MarketCapitalization),
            ["freeCashFlowYield"] = InputRules.Ratio(fcf, request.MarketCapitalization),
            ["revenueGrowthYoY"] = Growth(c.Revenue, request.PriorYear?.Revenue),
            ["netIncomeGrowthYoY"] = Growth(c.NetIncome, request.PriorYear?.NetIncome)
        };
        return new(c.Symbol, c.Currency, request.AsOf, c.PeriodStart, c.PeriodEnd, c.PublishedOn, factors);
    }
    private static Factor Amount(double? value) => value is null ? new(null, "Missing input.") : new(value);
    private static Factor Growth(double? current, double? prior) => InputRules.Ratio(current - prior, prior, true);
    private static void Validate(FinancialStatement s, DateOnly asOf)
    {
        InputRules.Identity(s.Symbol, s.Currency);
        var days = s.PeriodEnd.DayNumber - s.PeriodStart.DayNumber + 1;
        if (s.PeriodStart == default || days < 1 || days > 371 || s.PublishedOn < s.PeriodEnd || s.PublishedOn > asOf)
            throw new ArgumentException("Statement requires a 1–371 day period and publication between period end and AsOf.");
        foreach (var n in new[] { s.Revenue, s.GrossProfit, s.OperatingIncome, s.NetIncome, s.OperatingCashFlow, s.TotalEquity })
            InputRules.Number(n, "Statement value");
        foreach (var n in new[] { s.CapitalExpenditure, s.TotalAssets, s.TotalDebt, s.Cash,
                     s.CurrentAssets, s.CurrentLiabilities, s.DilutedShares })
            InputRules.Number(n, "Statement balance / capex / shares", true);
    }
}
