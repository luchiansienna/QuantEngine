using System.Diagnostics;
using System.Globalization;
using Microsoft.Extensions.Options;

namespace QuantWebApi;

public sealed class QuantEngineClient(
    IOptions<QuantEngineOptions> options,
    ILogger<QuantEngineClient> logger)
{
    private readonly QuantEngineOptions _options = options.Value;

    public async Task<string> AnalyseBondAsync(
        BondAnalysisRequest request,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = _options.ExecutablePath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        Add(startInfo, request.FaceValue);
        Add(startInfo, request.CouponRate);
        Add(startInfo, request.MaturityYears);
        startInfo.ArgumentList.Add(request.PaymentsPerYear.ToString(CultureInfo.InvariantCulture));
        Add(startInfo, request.Yield);

        foreach (var shock in request.EffectiveShocks)
            Add(startInfo, shock);

        using var process = new Process { StartInfo = startInfo };
        if (!process.Start())
            throw new InvalidOperationException("The native quant engine could not be started.");

        var outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var errorTask = process.StandardError.ReadToEndAsync(cancellationToken);

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.TimeoutSeconds));

        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            process.Kill(entireProcessTree: true);
            throw new TimeoutException("The native quant engine exceeded its execution timeout.");
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
            throw;
        }

        var output = await outputTask;
        var error = await errorTask;

        if (process.ExitCode != 0)
        {
            logger.LogWarning("Quant engine failed with exit code {ExitCode}: {Error}", process.ExitCode, error);
            throw new InvalidOperationException($"The native quant engine rejected the calculation: {error.Trim()}");
        }

        return output;
    }

    private static void Add(ProcessStartInfo startInfo, double value) =>
        startInfo.ArgumentList.Add(value.ToString("R", CultureInfo.InvariantCulture));
}
