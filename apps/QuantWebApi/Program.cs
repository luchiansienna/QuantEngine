using QuantWebApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddOptions<QuantEngineOptions>()
    .Bind(builder.Configuration.GetSection(QuantEngineOptions.SectionName));
builder.Services.AddSingleton<QuantEngineClient>();
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

app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
