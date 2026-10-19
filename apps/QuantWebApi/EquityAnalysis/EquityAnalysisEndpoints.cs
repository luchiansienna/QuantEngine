using QuantEngine.Fundamentals;
using QuantEngine.InvestorExpectations;

namespace QuantWebApi.EquityAnalysis;

public static class EquityAnalysisEndpoints
{
    public static void MapEquityAnalysisEndpoints(this WebApplication app)
    {
        app.MapPost("/api/fundamentals/analyse", (FundamentalsRequest request) =>
            Calculate(() => FundamentalsEngine.Analyse(request)));
        app.MapPost("/api/investor-expectations/analyse", (ExpectationsRequest request) =>
            Calculate(() => InvestorExpectationsEngine.Analyse(request)));
    }
    private static IResult Calculate<T>(Func<T> calculate)
    {
        try { return Results.Ok(calculate()); }
        catch (ArgumentException e)
        {
            return Results.Problem(statusCode: 400, title: "Invalid equity analysis inputs", detail: e.Message);
        }
    }
}
