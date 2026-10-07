using System.Diagnostics;
using System.Text.Json;
using QuantWebApi.Strategies;

void Check(bool ok, string name) { if (!ok) throw new Exception(name); }
void Reject(StockBacktestRequest request) {
    bool rejected = false;
    try { request.Validate(1000); } catch (ArgumentException) { rejected = true; }
    Check(rejected, "Invalid request accepted");
}
var bars = Enumerable.Range(0, 250).Select(i => new StockBar(
    new DateOnly(2021, 1, 1).AddDays(i).ToString("yyyy-MM-dd"), 100 + i % 17, 101 + i % 19)).ToArray();
var catalogJson = JsonSerializer.Serialize(StockStrategyCatalog.Algorithms,
    new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
using (var catalog = JsonDocument.Parse(catalogJson)) {
    Check(catalog.RootElement.GetArrayLength() == 3, "Catalog size");
    foreach (var item in catalog.RootElement.EnumerateArray())
        Check(item.GetProperty("parameters").GetArrayLength() > 0 && item.GetProperty("description").GetString()!.Length > 0,
            "Catalog contract");
}
foreach (var algorithm in StockStrategyCatalog.Algorithms) {
    var parameters = algorithm.Parameters.ToDictionary(p => p.Key, p => p.Default);
    var request = new StockBacktestRequest("dataset", algorithm.Id, Parameters: parameters);
    var command = request.ToCommand(bars);
    Check(command.StartsWith($"stock-backtest-v2 {algorithm.Id} {parameters.Count} "), "Command contract");
    if (args.Length == 1) {
        var start = new ProcessStartInfo(args[0]) { RedirectStandardInput = true, RedirectStandardOutput = true,
            RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add("--server");
        using var engine = Process.Start(start)!;
        await engine.StandardInput.WriteLineAsync(command);
        engine.StandardInput.Close();
        var line = await engine.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10));
        using var result = JsonDocument.Parse(line ?? throw new Exception("No engine response"));
        Check(result.RootElement.GetProperty("strategy").GetString() == algorithm.Id, "Result strategy ID");
        Check(result.RootElement.GetProperty("equity").GetArrayLength() == bars.Length, "Equity length");
        foreach (var p in parameters) Check(result.RootElement.GetProperty("parameters").GetProperty(p.Key).GetDouble() == p.Value, "Result parameters");
        await engine.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
        Check(engine.ExitCode == 0, "Engine exit");
    }
}
Reject(new("dataset", "unknown"));
Reject(new("dataset", Parameters: new() { ["fastWindow"] = 50, ["slowWindow"] = 20 }));
Reject(new("dataset", Parameters: new() { ["fastWindow"] = 1.5 }));
Reject(new("dataset", Parameters: new() { ["typo"] = 1 }));
Reject(new("dataset", "momentum-long-cash", Parameters: new() { ["lookback"] = 0 }));
Reject(new("dataset", "rsi-mean-reversion", Parameters: new() { ["entryBelow"] = 80, ["exitAbove"] = 70 }));
Reject(new("dataset", InitialCash: double.NaN));
var legacy = new StockBacktestRequest("dataset", FastWindow: 10, SlowWindow: 30).ToCommand(bars);
Check(legacy.StartsWith("stock-backtest-v2 sma-long-cash 2 10 30 "), "Legacy request compatibility");
Console.WriteLine("Stock API checks passed" + (args.Length == 1 ? " with all three C++ strategies" : ""));
