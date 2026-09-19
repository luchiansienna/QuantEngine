using System.Globalization;

namespace QuantWebApi.Risk;

public sealed record ExposureRow(string TradeId, string Counterparty, string NettingSet,
    string AsOf, string Currency, string Metric, decimal Tenor, decimal Confidence,
    string ModelVersion, string ScenarioId, double Value);
public sealed record ReconciliationRequest(List<ExposureRow>? Engine, List<ExposureRow>? Reporting,
    double AbsoluteTolerance = .01, double RelativeTolerance = .001);
public sealed record ExposureKey(string TradeId, string Counterparty, string NettingSet, string Metric, decimal Tenor);
public sealed record ReconciliationBreak(ExposureKey Key, string Status, string[] Reasons,
    ExposureRow[] EngineRows, ExposureRow[] ReportingRows, double? Difference, double? AllowedDifference);
public sealed record ReconciliationResult(DateTimeOffset ReconciledAt, int EngineCount, int ReportingCount,
    int Matched, int Breaks, double AbsoluteTolerance, double RelativeTolerance, ReconciliationBreak[] Rows);

public static class ExposureReconciliation
{
    public static ReconciliationResult Run(ReconciliationRequest request)
    {
        RiskInput.Range(request.AbsoluteTolerance, 0, 1e12, "Absolute tolerance");
        RiskInput.Range(request.RelativeTolerance, 0, 1, "Relative tolerance");
        var engine = Validate(request.Engine, "Engine");
        var reporting = Validate(request.Reporting, "Reporting");
        var left = engine.GroupBy(Key).ToDictionary(g => g.Key, g => g.ToArray());
        var right = reporting.GroupBy(Key).ToDictionary(g => g.Key, g => g.ToArray());
        var result = new List<ReconciliationBreak>();
        foreach (var key in left.Keys.Union(right.Keys).OrderBy(x => x.Counterparty, StringComparer.Ordinal)
            .ThenBy(x => x.NettingSet, StringComparer.Ordinal).ThenBy(x => x.TradeId, StringComparer.Ordinal)
            .ThenBy(x => x.Metric, StringComparer.Ordinal).ThenBy(x => x.Tenor))
        {
            var a = left.GetValueOrDefault(key) ?? [];
            var b = right.GetValueOrDefault(key) ?? [];
            if (a.Length > 1 || b.Length > 1)
            {
                result.Add(new(key, "duplicate", ["Duplicate key: resolve source records before comparing."], a, b, null, null));
                continue;
            }
            if (a.Length == 0 || b.Length == 0)
            {
                result.Add(new(key, a.Length == 0 ? "missing-in-engine" : "missing-in-reporting", [], a, b, null, null));
                continue;
            }
            var x = a[0]; var y = b[0];
            var reasons = new List<string>();
            if (x.AsOf != y.AsOf) reasons.Add("As-of date differs");
            if (x.Currency != y.Currency) reasons.Add("Currency differs; no FX conversion applied");
            if (x.Confidence != y.Confidence) reasons.Add("Confidence differs");
            if (x.ModelVersion != y.ModelVersion) reasons.Add("Model version differs");
            if (x.ScenarioId != y.ScenarioId) reasons.Add("Scenario/input snapshot differs");
            if (reasons.Count > 0)
            {
                result.Add(new(key, "context-mismatch", reasons.ToArray(), a, b, null, null));
                continue;
            }
            var difference = y.Value - x.Value;
            var tolerance = Math.Max(request.AbsoluteTolerance, request.RelativeTolerance * Math.Abs(x.Value));
            var matched = Math.Abs(difference) <= tolerance;
            result.Add(new(key, matched ? "matched" : "value-break",
                matched ? [] : ["Reporting minus engine exceeds tolerance"], a, b, difference, tolerance));
        }
        var matchedCount = result.Count(x => x.Status == "matched");
        return new(DateTimeOffset.UtcNow, engine.Count, reporting.Count, matchedCount, result.Count-matchedCount,
            request.AbsoluteTolerance, request.RelativeTolerance, result.ToArray());
    }
    private static ExposureKey Key(ExposureRow row) => new(row.TradeId, row.Counterparty, row.NettingSet, row.Metric, row.Tenor);
    private static List<ExposureRow> Validate(List<ExposureRow>? rows, string source)
    {
        if (rows is null || rows.Count > 10000) throw new ArgumentException($"{source}: supply an array of at most 10,000 rows.");
        foreach (var row in rows)
        {
            if (row is null) throw new ArgumentException($"{source}: null row.");
            foreach (var text in new[] { row.TradeId, row.Counterparty, row.NettingSet, row.ModelVersion, row.ScenarioId })
                if (string.IsNullOrWhiteSpace(text) || text != text.Trim() || text.Length > 200 || text.Any(char.IsControl))
                    throw new ArgumentException($"{source}: identifiers must be nonblank, trimmed, at most 200 characters and contain no control characters.");
            if (!DateOnly.TryParseExact(row.AsOf, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                throw new ArgumentException($"{source}: use an ISO as-of date (yyyy-MM-dd).");
            if (row.Currency is null || row.Currency.Length != 3 || row.Currency.Any(c => c < 'A' || c > 'Z'))
                throw new ArgumentException($"{source}: currency must be a three-letter uppercase code.");
            if (row.Metric is not ("EE" or "PFE") || row.Tenor < 0 || row.Tenor > 30 || row.Confidence < .5m || row.Confidence > .9999m)
                throw new ArgumentException($"{source}: invalid metric, tenor or confidence.");
            RiskInput.Range(row.Value, 0, 1e15, $"{source} exposure");
        }
        return rows;
    }
}
