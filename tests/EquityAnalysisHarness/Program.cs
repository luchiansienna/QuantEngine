using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using QuantEngine.Fundamentals;
using QuantEngine.InvestorExpectations;
using QuantWebApi.EquityAnalysis;

var checks = 0;
void Check(bool condition, string name) { checks++; if (!condition) throw new Exception(name); }
void Near(double? actual, double expected, string name) => Check(actual.HasValue && Math.Abs(actual.Value - expected) < 1e-10, name);
void Reject(Action action, string name)
{
    try { action(); } catch (ArgumentException) { checks++; return; }
    throw new Exception("Accepted invalid input: " + name);
}
DateOnly D(string date) => DateOnly.ParseExact(date, "yyyy-MM-dd");
var statement = new FinancialStatement("TEST", "USD", D("2025-01-01"), D("2025-12-31"), D("2026-02-01"),
    Revenue: 200, GrossProfit: 100, OperatingIncome: 50, NetIncome: 20, OperatingCashFlow: 40,
    CapitalExpenditure: 10, TotalAssets: 400, TotalEquity: 100, TotalDebt: 60, Cash: 80,
    CurrentAssets: 90, CurrentLiabilities: 30, DilutedShares: 10);
var prior = statement with { PeriodStart = D("2024-01-01"), PeriodEnd = D("2024-12-31"),
    PublishedOn = D("2025-02-01"), Revenue = 100, NetIncome = -10 };
var fundamentals = new FundamentalsRequest(D("2026-03-01"), statement, prior, 500);
var f = FundamentalsEngine.Analyse(fundamentals).Factors;
foreach (var (key, expected) in new Dictionary<string, double> {
    ["grossMargin"] = .5, ["operatingMargin"] = .25, ["netMargin"] = .1, ["cashFlowMargin"] = .2,
    ["freeCashFlow"] = 30, ["freeCashFlowMargin"] = .15, ["returnOnEndingAssets"] = .05,
    ["returnOnEndingEquity"] = .2, ["debtToEquity"] = .6, ["currentRatio"] = 3,
    ["netDebt"] = -20, ["dilutedEps"] = 2, ["earningsYield"] = .04, ["freeCashFlowYield"] = .06,
    ["revenueGrowthYoY"] = 1, ["netIncomeGrowthYoY"] = 3 }) Near(f[key].Value, expected, key);
var missing = FundamentalsEngine.Analyse(fundamentals with { Current = statement with {
    NetIncome = null, CapitalExpenditure = null, Revenue = 0, TotalEquity = -1, CurrentLiabilities = 0 }, PriorYear = null });
foreach (var key in new[] { "netMargin", "freeCashFlow", "grossMargin", "returnOnEndingEquity", "currentRatio", "netIncomeGrowthYoY" })
    Check(missing.Factors[key] is { Value: null, UnavailableReason: not null }, "Unavailable " + key);
Near(FundamentalsEngine.Analyse(fundamentals with { Current = statement with { NetIncome = -20 } }).Factors["netMargin"].Value, -.1, "Loss margin");
Check(InputRules.Ratio(1, double.Epsilon).Value is null, "Overflow guarded");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { AsOf = D("2026-01-01") }), "Future filing");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { Current = null! }), "Null statement");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { PriorYear = prior with { Currency = "GBP" } }), "Currency mismatch");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { PriorYear = prior with { Symbol = "OTHER" } }), "Symbol mismatch");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { PriorYear = prior with { PeriodStart = D("2024-10-01") } }), "Duration mismatch");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { Current = statement with { NetIncome = double.NaN } }), "NaN");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { Current = statement with { CapitalExpenditure = -1 } }), "Capex sign");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { Current = statement with { TotalAssets = double.PositiveInfinity } }), "Infinity");
Reject(() => FundamentalsEngine.Analyse(fundamentals with { MarketCapitalization = -1 }), "Negative market cap");
var current = new EstimateSnapshot(D("2026-01-31"), new[] {
    new AnalystEstimate("A", D("2026-01-30"), 1, 100), new AnalystEstimate("B", D("2026-01-31"), 3, 140) });
var previous = new EstimateSnapshot(D("2026-01-01"), new[] { new AnalystEstimate("A", D("2026-01-01"), 1) });
var expectations = new ExpectationsRequest("TEST", "USD", D("2026-03-01"), D("2025-12-31"), current,
    previous, new(D("2026-02-01"), 2.5), 100);
var e = InvestorExpectationsEngine.Analyse(expectations);
Near(e.Current.MeanEps, 2, "Mean"); Near(e.Current.MedianEps, 2, "Median");
Near(e.Current.PopulationStandardDeviation, 1, "SD"); Near(e.Current.RelativeDispersion.Value, .5, "Dispersion");
Near(e.EpsRevision.Value, 1, "Revision"); Near(e.EarningsSurprise.Value, .25, "Surprise"); Near(e.TargetUpside.Value, .2, "Upside");
Check(e.Current.AnalystCount == 2 && e.Current.PriceTargetCount == 2, "Coverage counts");
var singleton = InvestorExpectationsEngine.Analyse(expectations with { Current = previous, Previous = null, Actual = null, SpotPrice = null });
Near(singleton.Current.MedianEps, 1, "Singleton median"); Near(singleton.Current.PopulationStandardDeviation, 0, "Singleton SD");
Check(singleton.TargetUpside.Value is null && singleton.EpsRevision.Value is null && singleton.EarningsSurprise.Value is null, "Optional inputs");
var zero = current with { Estimates = new[] { new AnalystEstimate("A", current.ObservedOn, 0) } };
Check(InvestorExpectationsEngine.Analyse(expectations with { Current = zero }).EarningsSurprise.Value is null, "Zero EPS base");
var negative = current with { Estimates = new[] { new AnalystEstimate("A", current.ObservedOn, -2) } };
Near(InvestorExpectationsEngine.Analyse(expectations with { Current = negative, Actual = new(D("2026-02-01"), -1) }).EarningsSurprise.Value, .5, "Loss surprise");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { Current = current with { Estimates = Array.Empty<AnalystEstimate>() } }), "Empty consensus");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { Current = current with { Estimates = new[] { current.Estimates[0], current.Estimates[0] with { Analyst = " a " } } } }), "Duplicate analyst");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { Previous = current }), "Unordered snapshots");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { AsOf = D("2026-01-01"), Actual = null }), "Future snapshot");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { Actual = new(current.ObservedOn, 2) }), "Post-announcement consensus");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { Actual = new(D("2026-04-01"), 2) }), "Future actual");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { Current = current with { Estimates = new[] { new AnalystEstimate("A", D("2026-02-01"), 1) } } }), "Future estimate");
Reject(() => InvestorExpectationsEngine.Analyse(expectations with { Current = current with { Estimates = new[] { new AnalystEstimate("A", current.ObservedOn, double.NaN) } } }), "Nonfinite estimate");

// Exercise the real route registration and HTTP serialization without IBKR or the native worker.
var builder = WebApplication.CreateBuilder();
builder.Logging.ClearProviders();
builder.WebHost.UseUrls("http://127.0.0.1:0");
await using var app = builder.Build();
app.MapEquityAnalysisEndpoints();
await app.StartAsync();
try
{
    var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
    using var client = new HttpClient { BaseAddress = new Uri(address) };
    using var response = await client.PostAsJsonAsync("/api/fundamentals/analyse", fundamentals);
    Check(response.StatusCode == HttpStatusCode.OK, "Fundamentals HTTP");
    using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    Near(json.RootElement.GetProperty("factors").GetProperty("freeCashFlow").GetProperty("value").GetDouble(), 30, "HTTP formula");
    using var expectationResponse = await client.PostAsJsonAsync("/api/investor-expectations/analyse", expectations);
    Check(expectationResponse.StatusCode == HttpStatusCode.OK, "Expectations HTTP");
    using var invalid = await client.PostAsJsonAsync("/api/fundamentals/analyse", fundamentals with { Current = null! });
    Check(invalid.StatusCode == HttpStatusCode.BadRequest, "Validation HTTP 400");
    using var missingEps = new StringContent("{\"symbol\":\"TEST\",\"currency\":\"USD\",\"asOf\":\"2026-03-01\",\"fiscalPeriodEnd\":\"2025-12-31\",\"current\":{\"observedOn\":\"2026-01-31\",\"estimates\":[{\"analyst\":\"A\",\"observedOn\":\"2026-01-31\"}]}}", Encoding.UTF8, "application/json");
    using var badJson = await client.PostAsync("/api/investor-expectations/analyse", missingEps);
    Check(badJson.StatusCode == HttpStatusCode.BadRequest, "Missing EPS is not zero");
}
finally { await app.StopAsync(); }
Console.WriteLine($"Equity analysis: {checks} checks passed (including HTTP integration).");
