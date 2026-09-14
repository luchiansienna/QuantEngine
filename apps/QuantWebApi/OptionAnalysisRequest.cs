namespace QuantWebApi;

public sealed record OptionAnalysisRequest(
    string OptionType,
    double Spot,
    double Strike,
    double RiskFreeRate,
    double Volatility,
    double TimeToExpiry,
    double MarketPrice)
{
    public Dictionary<string, string[]>? Validate()
    {
        var errors = new Dictionary<string, string[]>();

        if (!string.Equals(OptionType, "Call", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(OptionType, "Put", StringComparison.OrdinalIgnoreCase))
            errors[nameof(OptionType)] = ["Option type must be Call or Put."];
        if (Spot <= 0 || Spot > 1e9) errors[nameof(Spot)] = ["Spot must be positive."];
        if (Strike <= 0 || Strike > 1e9) errors[nameof(Strike)] = ["Strike must be positive."];
        if (RiskFreeRate < -0.5 || RiskFreeRate > 1) errors[nameof(RiskFreeRate)] = ["Risk-free rate must be between -50% and 100%."];
        if (Volatility <= 0 || Volatility > 5) errors[nameof(Volatility)] = ["Volatility must be above 0% and no more than 500%."];
        if (TimeToExpiry <= 0 || TimeToExpiry > 100) errors[nameof(TimeToExpiry)] = ["Time to expiry must be between 0 and 100 years."];
        if (MarketPrice <= 0 || MarketPrice > 1e9) errors[nameof(MarketPrice)] = ["Market price must be positive."];

        var values = new[] { Spot, Strike, RiskFreeRate, Volatility, TimeToExpiry, MarketPrice };
        if (values.Any(value => !double.IsFinite(value)))
            errors["Inputs"] = ["Inputs must be finite numbers."];

        return errors.Count == 0 ? null : errors;
    }
}
