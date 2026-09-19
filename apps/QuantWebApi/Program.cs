using QuantWebApi.Risk;
using QuantWebApi;
using QuantWebApi.MarketData;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddOptions<QuantEngineOptions>()
    .Bind(builder.Configuration.GetSection(QuantEngineOptions.SectionName));
builder.Services.AddSingleton<QuantEngineClient>();
builder.Services
    .AddOptions<IbkrOptions>()
    .Bind(builder.Configuration.GetSection(
        IbkrOptions.SectionName));

builder.Services.AddSingleton<IbkrMarketDataClient>();
builder.Services.AddProblemDetails();

var app = builder.Build();

app.UseExceptionHandler();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapPost("/api/bonds/analyse", async Task<IResult> (
    BondAnalysisRequest request,
    QuantEngineClient engine,
    CancellationToken cancellationToken) =>
{
    var validationError = request.Validate();
    if (validationError is not null)
        return Results.ValidationProblem(validationError);

    try
    {
        var json = await engine.AnalyseBondAsync(request, cancellationToken);
        return Results.Text(json, "application/json");
    }
    catch (ArgumentException exception)
    {
        return Results.Problem(statusCode: 400, title: "Invalid bond inputs",
            detail: exception.Message);
    }
    catch (TimeoutException)
    {
        return Results.Problem(statusCode: 504, title: "Pricing timeout",
            detail: "The pricing worker did not respond within the configured timeout.");
    }
});

app.MapPost("/api/options/analyse", async Task<IResult> (
    OptionAnalysisRequest request,
    QuantEngineClient engine,
    CancellationToken cancellationToken) =>
{
    var validationError = request.Validate();
    if (validationError is not null)
        return Results.ValidationProblem(validationError);

    try
    {
        var json = await engine.AnalyseOptionAsync(request, cancellationToken);
        return Results.Text(json, "application/json");
    }
    catch (ArgumentException exception)
    {
        return Results.Problem(statusCode: 400, title: "Invalid option inputs",
            detail: exception.Message);
    }
    catch (TimeoutException)
    {
        return Results.Problem(statusCode: 504, title: "Pricing timeout",
            detail: "The pricing worker did not respond within the configured timeout.");
    }
});
app.MapGet(
    "/api/market-data/options/snapshot",
    async Task<IResult> (
        string symbol,
        string expiry,
        double strike,
        string optionType,
        IbkrMarketDataClient marketData,
        CancellationToken cancellationToken) =>
    {
        var request = new IbkrOptionSnapshotRequest(
            symbol,
            expiry,
            strike,
            optionType);

        var validationErrors = request.Validate();

        if (validationErrors is not null)
        {
            return Results.ValidationProblem(
                validationErrors);
        }

        try
        {
            var snapshot =
                await marketData.GetOptionSnapshotAsync(
                    request,
                    cancellationToken);

            return Results.Ok(snapshot);
        }
        catch (ArgumentException exception)
        {
            return Results.Problem(
                statusCode: 400,
                title: "Invalid option contract",
                detail: exception.Message);
        }
        catch (TimeoutException exception)
        {
            return Results.Problem(
                statusCode: 504,
                title: "IBKR market-data timeout",
                detail: exception.Message);
        }
        catch (IbkrException exception)
        {
            return Results.Problem(
                statusCode: 502,
                title: "IBKR market-data error",
                detail: exception.Message);
        }
    });
app.MapRiskEndpoints();
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
