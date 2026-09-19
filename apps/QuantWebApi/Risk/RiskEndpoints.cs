namespace QuantWebApi.Risk;

public static class RiskEndpoints
{
    public static void MapRiskEndpoints(this WebApplication app)
    {
        app.MapPost("/api/risk/analyse", (RiskRequest request, QuantEngineClient engine, CancellationToken ct) =>
            Native(() => engine.AnalyseRiskAsync(request, ct)));
        app.MapPost("/api/risk/credit-bond", (CreditBondRequest request, QuantEngineClient engine, CancellationToken ct) =>
            Native(() => engine.PriceCreditBondAsync(request, ct)));
        app.MapPost("/api/risk/historical-var", (HistoricalVarRequest request, QuantEngineClient engine, CancellationToken ct) =>
            Native(() => engine.HistoricalVarAsync(request, ct)));
        app.MapPost("/api/risk/reconcile", (ReconciliationRequest request) =>
        {
            try { return Results.Ok(ExposureReconciliation.Run(request)) as IResult; }
            catch (ArgumentException e) { return Invalid(e); }
        });
    }
    private static async Task<IResult> Native(Func<Task<string>> action)
    {
        try { return Results.Text(await action(), "application/json"); }
        catch (ArgumentException e) { return Invalid(e); }
        catch (TimeoutException) { return Results.Problem(statusCode: 504, title: "Risk calculation timed out", detail: "Reduce paths or time steps and retry."); }
    }
    private static IResult Invalid(ArgumentException e) => Results.Problem(statusCode: 400, title: "Invalid risk inputs", detail: e.Message);
}
