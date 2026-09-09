using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace QuantWebApi;

// Registered as a singleton: one native worker per API instance, started on first use.
public sealed class QuantEngineClient(
    IOptions<QuantEngineOptions> options,
    ILogger<QuantEngineClient> logger) : IAsyncDisposable
{
    private readonly QuantEngineOptions _options = options.Value;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private Process? _process;
    private Task? _stderrTask;
    private bool _disposed;

    public async Task<string> AnalyseBondAsync(
        BondAnalysisRequest request, CancellationToken cancellationToken)
    {
        if (_options.TimeoutSeconds <= 0)
            throw new InvalidOperationException("QuantEngine timeout must be positive.");

        var values = new List<double>
        {
            request.FaceValue, request.CouponRate, request.MaturityYears,
            request.PaymentsPerYear, request.Yield
        };
        values.AddRange(request.EffectiveShocks);
        if (values.Any(value => !double.IsFinite(value)))
            throw new ArgumentException("Inputs must be finite numbers.");

        var line = string.Join(" ", values.Select(value =>
            value.ToString("R", CultureInfo.InvariantCulture)));

        // Includes time spent waiting for the worker.
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(_options.TimeoutSeconds));
        var acquired = false;
        try
        {
            await _gate.WaitAsync(timeout.Token);
            acquired = true;
            ObjectDisposedException.ThrowIf(_disposed, this);
            timeout.Token.ThrowIfCancellationRequested();

            if (_process is null || _process.HasExited)
            {
                await StopWorkerAsync();
                StartWorker();
            }

            string response;
            try
            {
                await _process!.StandardInput.WriteLineAsync(line.AsMemory(), timeout.Token);
                await _process.StandardInput.FlushAsync(timeout.Token);
                response = await _process.StandardOutput.ReadLineAsync(timeout.Token)
                    ?? throw new IOException("The native engine closed its response stream.");

                // Reject malformed output before releasing ownership of the worker.
                using var document = JsonDocument.Parse(response);
                if (document.RootElement.ValueKind != JsonValueKind.Object)
                    throw new IOException("Invalid native response.");
            }
            catch
            {
                // A cancelled read may leave a late reply pending. Discard the worker
                // so the next caller can never consume the previous caller's result.
                await StopWorkerAsync();
                throw;
            }

            using var result = JsonDocument.Parse(response);
            if (result.RootElement.TryGetProperty("error", out var error))
                throw new ArgumentException(error.GetString() ?? "Native engine rejected inputs.");

            return response;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("Timed out waiting for the native quant engine.");
        }
        finally
        {
            if (acquired) _gate.Release();
        }
    }

    private void StartWorker()
    {
        var info = new ProcessStartInfo
        {
            FileName = _options.ExecutablePath,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        info.ArgumentList.Add("--server");
        var process = new Process { StartInfo = info };
        try
        {
            if (!process.Start())
                throw new InvalidOperationException("Could not start the native engine.");
        }
        catch
        {
            process.Dispose();
            throw;
        }
        _process = process;
        _stderrTask = DrainErrorsAsync(process);
        logger.LogInformation("Started persistent QuantCli worker {ProcessId}", process.Id);
    }

    private async Task DrainErrorsAsync(Process process)
    {
        try
        {
            while (await process.StandardError.ReadLineAsync() is { } line)
                logger.LogWarning("QuantCli: {Message}", line);
        }
        catch (IOException) { /* Worker stream closed during shutdown. */ }
        catch (ObjectDisposedException) { }
    }

    private async Task StopWorkerAsync()
    {
        var process = _process;
        if (process is null) return;
        // Keep ownership until termination succeeds; don't start a second worker
        // if the OS refuses to terminate this one.
        try
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException) when (process.HasExited) { }
        await process.WaitForExitAsync();
        if (_stderrTask is not null) await _stderrTask;
        process.Dispose();
        _process = null;
        _stderrTask = null;
    }

    public async ValueTask DisposeAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_disposed) return;
            _disposed = true;
            await StopWorkerAsync();
        }
        finally { _gate.Release(); }
    }
}