namespace QuantWebApi;

public sealed record BondAnalysisRequest(
    double FaceValue,
    double CouponRate,
    double MaturityYears,
    int PaymentsPerYear,
    double Yield,
    IReadOnlyList<double>? ShocksBasisPoints,
    IReadOnlyList<CurvePoint>? CurvePoints = null)
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

        if (CurvePoints is not null)
        {
            if (CurvePoints.Count is < 2 or > 30 || CurvePoints.Any(p => p is null ||
                !double.IsFinite(p.MaturityYears) || !double.IsFinite(p.Rate) ||
                p.MaturityYears <= 0 || p.MaturityYears > 100 || p.Rate < -.5 || p.Rate > 1))
                errors[nameof(CurvePoints)] = ["Supply 2–30 finite curve points: tenor (0,100], rate [-50%,100%]."];
            else if (CurvePoints.Select(p => p.MaturityYears).Distinct().Count() != CurvePoints.Count)
                errors[nameof(CurvePoints)] = ["Curve maturities must be unique."];
        }
        if (!double.IsFinite(FaceValue) || !double.IsFinite(CouponRate) || !double.IsFinite(MaturityYears) ||
            !double.IsFinite(Yield) || EffectiveShocks.Any(s => !double.IsFinite(s)))
            errors["Inputs"] = ["All inputs must be finite."];
        var periods = MaturityYears * PaymentsPerYear;
        if (periods < 1 || Math.Abs(periods - Math.Round(periods)) > 1e-8)
            errors[nameof(MaturityYears)] = ["Maturity must contain a whole number of coupon periods."];
        return errors.Count == 0 ? null : errors;
    }
}

public sealed record CurvePoint(double MaturityYears, double Rate);
