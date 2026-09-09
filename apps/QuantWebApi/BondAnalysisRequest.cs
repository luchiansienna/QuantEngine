namespace QuantWebApi;

public sealed record BondAnalysisRequest(
    double FaceValue,
    double CouponRate,
    double MaturityYears,
    int PaymentsPerYear,
    double Yield,
    IReadOnlyList<double>? ShocksBasisPoints)
{
    private static readonly double[] DefaultShocks = [-100, -50, -25, 0, 25, 50, 100];

    public IReadOnlyList<double> EffectiveShocks =>
        ShocksBasisPoints is { Count: > 0 } ? ShocksBasisPoints : DefaultShocks;

    public Dictionary<string, string[]>? Validate()
    {
        var errors = new Dictionary<string, string[]>();

        if (FaceValue <= 0) errors[nameof(FaceValue)] = ["Face value must be positive."];
        if (CouponRate < 0 || CouponRate > 1) errors[nameof(CouponRate)] = ["Coupon rate must be between 0 and 1."];
        if (MaturityYears <= 0 || MaturityYears > 100) errors[nameof(MaturityYears)] = ["Maturity must be between 0 and 100 years."];
        if (PaymentsPerYear is not (1 or 2 or 4 or 12)) errors[nameof(PaymentsPerYear)] = ["Payments per year must be 1, 2, 4 or 12."];
        if (Yield <= -1 || Yield > 1) errors[nameof(Yield)] = ["Yield must be greater than -100% and no more than 100%."];
        if (EffectiveShocks.Count > 25) errors[nameof(ShocksBasisPoints)] = ["A maximum of 25 shocks is allowed."];

        return errors.Count == 0 ? null : errors;
    }
}
