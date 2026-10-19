using QuantEngine.Fundamentals;
using System.Text.Json.Serialization;

namespace QuantEngine.InvestorExpectations;

public sealed record AnalystEstimate(string Analyst, DateOnly ObservedOn, [property: JsonRequired] double Eps, double? PriceTarget = null);
public sealed record EstimateSnapshot(DateOnly ObservedOn, IReadOnlyList<AnalystEstimate> Estimates);
public sealed record ReportedEarnings(DateOnly PublishedOn, [property: JsonRequired] double Eps);
public sealed record ExpectationsRequest(string Symbol, string Currency, DateOnly AsOf,
    DateOnly FiscalPeriodEnd, EstimateSnapshot Current, EstimateSnapshot? Previous = null,
    ReportedEarnings? Actual = null, double? SpotPrice = null);
public sealed record Consensus(int AnalystCount, double MeanEps, double MedianEps,
    double PopulationStandardDeviation, Factor RelativeDispersion, double? MeanPriceTarget, int PriceTargetCount);
public sealed record ExpectationsResult(string Symbol, string Currency, DateOnly AsOf,
    DateOnly FiscalPeriodEnd, DateOnly CurrentObservedOn, DateOnly? PreviousObservedOn,
    DateOnly? ActualPublishedOn, Consensus Current, Consensus? Previous,
    Factor EpsRevision, Factor EarningsSurprise, Factor TargetUpside);

public static class InvestorExpectationsEngine
{
    public static ExpectationsResult Analyse(ExpectationsRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        InputRules.Identity(request.Symbol, request.Currency);
        if (request.Current is null || request.FiscalPeriodEnd == default || request.AsOf == default)
            throw new ArgumentException("Current estimates, fiscal period end and AsOf are required.");
        InputRules.Number(request.SpotPrice, "SpotPrice", true);
        if (request.Actual is { } actual)
        {
            InputRules.Number(actual.Eps, "Actual EPS");
            if (actual.PublishedOn < request.FiscalPeriodEnd || actual.PublishedOn > request.AsOf ||
                request.Current.ObservedOn >= actual.PublishedOn)
                throw new ArgumentException("Actual must be published by AsOf; consensus must precede publication.");
        }
        var current = Summarise(request.Current, request.AsOf);
        Consensus? previous = null;
        if (request.Previous is { } prior)
        {
            if (prior.ObservedOn >= request.Current.ObservedOn)
                throw new ArgumentException("Previous snapshot must precede current snapshot.");
            previous = Summarise(prior, request.AsOf);
        }
        return new(request.Symbol, request.Currency, request.AsOf, request.FiscalPeriodEnd,
            request.Current.ObservedOn, request.Previous?.ObservedOn, request.Actual?.PublishedOn, current, previous,
            InputRules.Ratio(current.MeanEps - previous?.MeanEps, previous?.MeanEps, true),
            InputRules.Ratio(request.Actual?.Eps - current.MeanEps, current.MeanEps, true),
            InputRules.Ratio(current.MeanPriceTarget - request.SpotPrice, request.SpotPrice));
    }
    private static Consensus Summarise(EstimateSnapshot snapshot, DateOnly asOf)
    {
        if (snapshot.ObservedOn == default || snapshot.ObservedOn > asOf || snapshot.Estimates is null ||
            snapshot.Estimates.Count is < 1 or > 1000)
            throw new ArgumentException("Snapshot requires 1–1000 estimates and an observation date no later than AsOf.");
        var analysts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in snapshot.Estimates)
        {
            if (e is null || string.IsNullOrWhiteSpace(e.Analyst) || !analysts.Add(e.Analyst.Trim()) ||
                e.ObservedOn == default || e.ObservedOn > snapshot.ObservedOn)
                throw new ArgumentException("Estimates require unique analysts and dates no later than the snapshot.");
            InputRules.Number(e.Eps, "Estimate EPS");
            InputRules.Number(e.PriceTarget, "PriceTarget", true);
        }
        var eps = snapshot.Estimates.Select(e => e.Eps).Order().ToArray();
        var mean = eps.Average();
        var median = eps.Length % 2 == 0 ? (eps[eps.Length / 2 - 1] + eps[eps.Length / 2]) / 2 : eps[eps.Length / 2];
        var sd = Math.Sqrt(eps.Select(e => (e - mean) * (e - mean)).Average());
        var targets = snapshot.Estimates.Where(e => e.PriceTarget.HasValue).Select(e => e.PriceTarget!.Value).ToArray();
        return new(eps.Length, mean, median, sd, InputRules.Ratio(sd, mean, true),
            targets.Length == 0 ? null : targets.Average(), targets.Length);
    }
}
