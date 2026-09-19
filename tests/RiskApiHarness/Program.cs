using QuantWebApi;
using QuantWebApi.Risk;

if (args.Contains("--serve"))
{
    var builder = WebApplication.CreateBuilder(args.Where(x => x != "--serve").ToArray());
    builder.Services.AddOptions<QuantEngineOptions>().Bind(builder.Configuration.GetSection(QuantEngineOptions.SectionName));
    builder.Services.AddSingleton<QuantEngineClient>();
    var app = builder.Build(); app.MapRiskEndpoints(); app.Run(); return;
}
int checks = 0;
void Check(bool ok, string name) { checks++; if (!ok) throw new Exception(name); }
void Reject(Action action, string name) { bool threw = false; try { action(); } catch (ArgumentException) { threw = true; } Check(threw, name); }
var row = new ExposureRow("NETTING-SET", "CP", "NS", "2026-09-19", "USD", "PFE", 1m, .95m, "v1", "snapshot", 10000);
ReconciliationResult Recon(List<ExposureRow> a, List<ExposureRow> b, double abs = .01, double rel = .001) => ExposureReconciliation.Run(new(a, b, abs, rel));
Check(Recon([row], [row]).Matched == 1, "identical matches");
Check(Recon([row], [row with { Value = 10010 }]).Matched == 1, "inclusive tolerance boundary");
Check(Recon([row], [row with { Value = 10011 }]).Rows[0].Status == "value-break", "value break");
Check(Recon([row], [row with { Value = 10011 }]).Rows[0].Difference == 11, "reporting minus engine sign");
Check(Recon([row], []).Rows[0].Status == "missing-in-reporting", "missing reporting");
Check(Recon([], [row]).Rows[0].Status == "missing-in-engine", "missing engine");
Check(Recon([row,row], [row]).Rows[0].Status == "duplicate", "duplicate engine");
Check(Recon([row], [row,row]).Rows[0].Status == "duplicate", "duplicate reporting");
Check(Recon([row], [row with { Currency="EUR" }]).Rows[0].Difference is null, "no cross-currency arithmetic");
Check(Recon([row], [row with { AsOf="2026-09-18" }]).Rows[0].Status == "context-mismatch", "stale snapshot");
Check(Recon([row], [row with { ModelVersion="v2", ScenarioId="other", Confidence=.99m }]).Rows[0].Reasons.Length == 3, "context reasons retained");
Check(Recon([row with { Value=0 }], [row with { Value=.01 }]).Matched == 1, "absolute tolerance handles zero");
Check(Recon([row], [row with { Counterparty="OTHER" }]).Breaks == 2, "counterparties never netted");
Check(Recon([], []).Rows.Length == 0, "empty inputs");
Check(Recon([row], [row with { Metric="EE" }]).Breaks == 2, "metric keys separate");
Reject(() => Recon([row with { Value=double.NaN }], []), "NaN rejected");
Reject(() => Recon([row with { TradeId=" " }], []), "blank key rejected");
Reject(() => Recon([row with { AsOf="2026-02-30" }], []), "invalid date rejected");
Reject(() => Recon([row with { Value=-1 }], []), "negative exposure rejected");
Reject(() => Recon([row], [row], -1), "negative tolerance rejected");
Reject(() => ExposureReconciliation.Run(new(null, [])), "null source rejected");
var request = new RiskRequest(100,.03,0,.2,1,.95,.05,10,0,.02,.4,10000,12,42,[new(1000,100)]);
Check(request.ToCommand().StartsWith("risk 100 0.03"), "invariant numeric protocol");
Reject(() => (request with { Steps=120, Paths=100000 }).ToCommand(), "bounded work");
Reject(() => (request with { Maturity=.01 }).ToCommand(), "invalid horizon");
Reject(() => (request with { Trades=null }).ToCommand(), "missing trades");
Reject(() => (request with { Spot=double.PositiveInfinity }).ToCommand(), "nonfinite request");
Reject(() => new CreditBondRequest(1000,.05,1.1,2,.03,.02,.4).ToCommand(), "coupon stub rejected");
Reject(() => new HistoricalVarRequest(.95,1,[]).ToCommand(), "empty historical data rejected");
Console.WriteLine($"{checks} API validation/reconciliation checks passed");
