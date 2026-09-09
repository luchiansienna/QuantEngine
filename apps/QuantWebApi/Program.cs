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

    var json = await engine.AnalyseBondAsync(request, cancellationToken);
    return Results.Text(json, "application/json");
});

app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
