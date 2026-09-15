using System.Collections.Concurrent;
using System.Reflection;
using IBApi;
using Microsoft.Extensions.Options;

namespace QuantWebApi.MarketData;

public sealed class IbkrMarketDataClient : IAsyncDisposable
{
    private readonly IbkrOptions _options;
    private readonly ILogger<IbkrMarketDataClient> _logger;

    private readonly SemaphoreSlim _connectionGate =
        new(1, 1);

    private readonly ConcurrentDictionary<int, ContractRequest>
        _contractRequests = new();

    private readonly ConcurrentDictionary<int, MarketDataRequest>
        _marketDataRequests = new();

    private EReaderMonitorSignal? _signal;
    private EClientSocket? _client;
    private EReader? _reader;

    private CancellationTokenSource? _readerCancellation;
    private Task? _readerTask;

    private TaskCompletionSource _connected =
        NewCompletionSource();

    private int _nextRequestId;
    private int _actualMarketDataType;

    public IbkrMarketDataClient(
        IOptions<IbkrOptions> options,
        ILogger<IbkrMarketDataClient> logger)
    {
        _options = options.Value;
        _logger = logger;

        ValidateOptions(_options);

        _actualMarketDataType =
            _options.MarketDataType;
    }

    public async Task<IbkrOptionSnapshot>
        GetOptionSnapshotAsync(
            IbkrOptionSnapshotRequest request,
            CancellationToken cancellationToken)
    {
        var validationErrors = request.Validate();

        if (validationErrors is not null)
        {
            throw new ArgumentException(
                string.Join(
                    " ",
                    validationErrors.Values.SelectMany(
                        messages => messages)));
        }

        await EnsureConnectedAsync(
            cancellationToken);

        var exactOption =
            await ResolveOptionContractAsync(
                request,
                cancellationToken);

        var underlying = new Contract
        {
            Symbol = request.NormalizedSymbol,
            SecType = "STK",
            Exchange = request.NormalizedExchange,
            Currency = request.NormalizedCurrency
        };

        var underlyingSnapshotTask =
            RequestMarketSnapshotAsync(
                underlying,
                cancellationToken);

        var optionSnapshotTask =
            RequestMarketSnapshotAsync(
                exactOption,
                cancellationToken);

        await Task.WhenAll(
            underlyingSnapshotTask,
            optionSnapshotTask);

        return new IbkrOptionSnapshot(
            await underlyingSnapshotTask,
            await optionSnapshotTask,
            request.Expiry,
            request.Strike,
            request.NormalizedOptionRight == "C"
                ? "Call"
                : "Put",
            DateTimeOffset.UtcNow,
            _actualMarketDataType,
            MarketDataTypeName(
                _actualMarketDataType));
    }

    private async Task EnsureConnectedAsync(
        CancellationToken cancellationToken)
    {
        if (_client?.IsConnected() == true)
            return;

        await _connectionGate.WaitAsync(
            cancellationToken);

        try
        {
            if (_client?.IsConnected() == true)
                return;

            _connected = NewCompletionSource();

            var wrapper =
                DispatchProxy.Create<
                    EWrapper,
                    IbkrCallbackProxy>();

            ((IbkrCallbackProxy)(object)wrapper)
                .Callback = HandleCallback;

            _signal =
                new EReaderMonitorSignal();

            _client =
                new EClientSocket(
                    wrapper,
                    _signal);

            _client.eConnect(
                _options.Host,
                _options.Port,
                _options.ClientId);

            if (!_client.IsConnected())
            {
                throw new IbkrException(
                    $"Could not connect to TWS at " +
                    $"{_options.Host}:{_options.Port}.");
            }

            _reader =
                new EReader(
                    _client,
                    _signal);

            _reader.Start();

            _readerCancellation =
                new CancellationTokenSource();

            _readerTask = Task.Run(
                () => ProcessMessages(
                    _readerCancellation.Token),
                CancellationToken.None);

            await _connected.Task.WaitAsync(
                TimeSpan.FromSeconds(
                    _options.ConnectionTimeoutSeconds),
                cancellationToken);

            _client.reqMarketDataType(
                _options.MarketDataType);

            _logger.LogInformation(
                "Connected to TWS at {Host}:{Port} " +
                "with client ID {ClientId}.",
                _options.Host,
                _options.Port,
                _options.ClientId);
        }
        catch (TimeoutException exception)
        {
            Disconnect();

            throw new IbkrException(
                "Timed out while completing the TWS API handshake.",
                exception);
        }
        catch
        {
            Disconnect();
            throw;
        }
        finally
        {
            _connectionGate.Release();
        }
    }

    private async Task<Contract>
        ResolveOptionContractAsync(
            IbkrOptionSnapshotRequest request,
            CancellationToken cancellationToken)
    {
        var requestId = NextRequestId();
        var pendingRequest = new ContractRequest();

        if (!_contractRequests.TryAdd(
                requestId,
                pendingRequest))
        {
            throw new IbkrException(
                "Could not register the IBKR contract request.");
        }

        var description = new Contract
        {
            Symbol = request.NormalizedSymbol,
            SecType = "OPT",
            Exchange = request.NormalizedExchange,
            Currency = request.NormalizedCurrency,
            LastTradeDateOrContractMonth = request.Expiry,
            Strike = request.Strike,
            Right = request.NormalizedOptionRight,
            Multiplier = "100"
        };

        try
        {
            _client!.reqContractDetails(
                requestId,
                description);

            await pendingRequest.Completed.Task.WaitAsync(
                TimeSpan.FromSeconds(
                    _options.SnapshotTimeoutSeconds),
                cancellationToken);

            if (pendingRequest.Contracts.Count == 0)
            {
                throw new IbkrException(
                    "No matching IBKR option contract was found for " +
                    $"{request.NormalizedSymbol} " +
                    $"{request.Expiry} " +
                    $"{request.Strike} " +
                    $"{request.NormalizedOptionRight}.");
            }

            if (pendingRequest.Contracts.Count > 1)
            {
                var matches = string.Join(
                    ", ",
                    pendingRequest.Contracts.Select(
                        contract =>
                            $"{contract.LocalSymbol} " +
                            $"on {contract.Exchange} " +
                            $"(conId {contract.ConId})"));

                throw new IbkrException(
                    "The option definition is ambiguous. " +
                    $"Matches: {matches}");
            }

            var exactContract =
                pendingRequest.Contracts[0];

            // Retain the exact IBKR conId but route the quote
            // through the requested exchange, normally SMART.
            exactContract.Exchange =
                request.NormalizedExchange;

            _logger.LogInformation(
    "Resolved IBKR option: conId={ContractId}, " +
    "localSymbol={LocalSymbol}, exchange={Exchange}, " +
    "primaryExchange={PrimaryExchange}, " +
    "tradingClass={TradingClass}, multiplier={Multiplier}.",
    exactContract.ConId,
    exactContract.LocalSymbol,
    exactContract.Exchange,
    exactContract.PrimaryExch,
    exactContract.TradingClass,
    exactContract.Multiplier);

            return exactContract;
        }
        catch (TimeoutException)
        {
            throw new TimeoutException(
                "IBKR did not finish resolving the option contract.");
        }
        finally
        {
            _contractRequests.TryRemove(
                requestId,
                out _);
        }
    }

    private async Task<IbkrMarketSnapshot>
        RequestMarketSnapshotAsync(
            Contract contract,
            CancellationToken cancellationToken)
    {
        var requestId = NextRequestId();

        var pendingRequest =
            new MarketDataRequest(contract);

        if (!_marketDataRequests.TryAdd(
                requestId,
                pendingRequest))
        {
            throw new IbkrException(
                "Could not register the IBKR market-data request.");
        }

        try
        {
            _client!.reqMktData(
                requestId,
                contract,
                string.Empty,
                false,
                false,
                []);

            await pendingRequest.Completed.Task.WaitAsync(
                TimeSpan.FromSeconds(
                    _options.SnapshotTimeoutSeconds),
                cancellationToken);

            return pendingRequest.CreateSnapshot();
        }
        catch (TimeoutException)
        {
            _client?.cancelMktData(
                requestId);

            throw new TimeoutException(
                $"IBKR did not complete the snapshot for " +
                $"{contract.LocalSymbol ?? contract.Symbol}.");
        }
        finally
        {
            try
            {
                _client?.cancelMktData(requestId);
            }
            catch (Exception exception)
            {
                _logger.LogDebug(
                    exception,
                    "Could not cancel IBKR market-data request {RequestId}.",
                    requestId);
            }

            _marketDataRequests.TryRemove(
                requestId,
                out _);
        }
    }

    private void ProcessMessages(
        CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested &&
               _client?.IsConnected() == true)
        {
            try
            {
                _signal!.waitForSignal();
                _reader!.processMsgs();
            }
            catch (Exception exception)
            {
                if (!cancellationToken.IsCancellationRequested)
                {
                    _logger.LogError(
                        exception,
                        "The IBKR message loop failed.");

                    FailPendingRequests(
                        "The IBKR connection was interrupted.");
                }

                break;
            }
        }
    }

    private void HandleTickOptionComputation(
    int requestId,
    int field,
    double impliedVolatility,
    double delta,
    double optionPrice,
    double presentValueDividend,
    double gamma,
    double vega,
    double theta,
    double underlyingPrice)
    {
        if (!_marketDataRequests.TryGetValue(
                requestId,
                out var request))
        {
            // Late callback after the request was completed or cancelled.
            return;
        }

        if (!double.IsFinite(optionPrice) ||
            optionPrice < 0.0)
        {
            return;
        }

        switch (field)
        {
            case 10: // live bid option computation
            case 80: // delayed bid option computation
                request.Bid = optionPrice;
                break;

            case 11: // live ask option computation
            case 81: // delayed ask option computation
                request.Ask = optionPrice;
                break;

            case 12: // live last option computation
            case 82: // delayed last option computation
                request.Last = optionPrice;
                break;

            case 13: // live model option computation
            case 83: // delayed model option computation
                     // Do not treat the IBKR model price as an actual traded price.
                break;

            default:
                return;
        }

        if ((request.Bid.HasValue && request.Ask.HasValue) ||
            request.Last.HasValue)
        {
            request.Completed.TrySetResult();
        }
    }

    private void HandleCallback(
      string callbackName,
      object?[] arguments)
    {
        if (callbackName is
            "tickPrice" or
                "tickOptionComputation" or
            "tickSnapshotEnd" or
            "marketDataType" or
            "error")
        {
            var formattedArguments = string.Join(
                ", ",
                arguments.Select(argument =>
                    argument is null
                        ? "null"
                        : $"{argument.GetType().Name}:{argument}"));

            _logger.LogInformation(
                "IBKR callback {Callback}: {Arguments}",
                callbackName,
                formattedArguments);
        }

        try
        {
            // Existing switch remains here.
            
                switch (callbackName)
            {
                case "nextValidId":
                    _connected.TrySetResult();
                    break;

                case "contractDetails":
                    HandleContractDetails(
                        arguments);
                    break;

                case "contractDetailsEnd":
                    HandleContractDetailsEnd(
                        arguments);
                    break;

                case "tickPrice":
                    HandleTickPrice(
                        Convert.ToInt32(arguments[0]),
                        Convert.ToInt32(arguments[1]),
                        Convert.ToDouble(arguments[2]));
                    break;



                case "tickOptionComputation":
                    HandleTickOptionComputation(
                        Convert.ToInt32(arguments[0]),
                        Convert.ToInt32(arguments[1]),
                        Convert.ToDouble(arguments[3]),
                        Convert.ToDouble(arguments[4]),
                        Convert.ToDouble(arguments[5]),
                        Convert.ToDouble(arguments[6]),
                        Convert.ToDouble(arguments[7]),
                        Convert.ToDouble(arguments[8]),
                        Convert.ToDouble(arguments[9]),
                        Convert.ToDouble(arguments[10]));
                    break;
                case "tickSnapshotEnd":
                    HandleSnapshotEnd(
                        arguments);
                    break;

                case "marketDataType":
                    HandleMarketDataType(
                        arguments);
                    break;

                case "connectionClosed":
                    FailPendingRequests(
                        "TWS closed the API connection.");
                    break;

                case "error":
                    HandleError(
                        arguments);
                    break;
            }
        }
        catch (Exception exception)
        {
            _logger.LogError(
                exception,
                "Failed to process IBKR callback {Callback}.",
                callbackName);
        }
    }

    private void HandleContractDetails(
        object?[] arguments)
    {
        if (arguments.Length < 2 ||
            arguments[0] is not int requestId ||
            arguments[1] is not ContractDetails details)
        {
            return;
        }

        if (_contractRequests.TryGetValue(
                requestId,
                out var pendingRequest))
        {
            pendingRequest.Contracts.Add(
                details.Contract);
        }
    }

    private void HandleContractDetailsEnd(
        object?[] arguments)
    {
        if (arguments.FirstOrDefault() is int requestId &&
            _contractRequests.TryGetValue(
                requestId,
                out var pendingRequest))
        {
            pendingRequest.Completed.TrySetResult();
        }
    }

    private static double? NormalisePrice(double price) =>
    double.IsFinite(price) && price > 0.0
        ? price
        : null;

    private void HandleTickPrice(
        int requestId,
        int tickType,
        double price)
    {
        if (!_marketDataRequests.TryGetValue(
                requestId,
                out var request))
        {
            // A late tick can arrive after cancellation.
            return;
        }

        var value = NormalisePrice(price);

        if (value is null)
        {
            return;
        }

        switch (tickType)
        {
            case 1:  // live bid
            case 66: // delayed bid
                request.Bid = value;
                break;

            case 2:  // live ask
            case 67: // delayed ask
                request.Ask = value;
                break;

            case 4:  // live last
            case 68: // delayed last
                request.Last = value;
                break;

            case 9:  // live close
            case 75: // delayed close
                request.Close = value;
                break;

            default:
                return;
        }

        if (request.Bid.HasValue &&
            request.Ask.HasValue)
        {
            request.Completed.TrySetResult();
            return;
        }

        if (request.Last.HasValue ||
            request.Close.HasValue)
        {
            request.Completed.TrySetResult();
        }
    }

    private void HandleSnapshotEnd(
        object?[] arguments)
    {
        if (arguments.FirstOrDefault() is int requestId &&
            _marketDataRequests.TryGetValue(
                requestId,
                out var pendingRequest))
        {
            pendingRequest.Completed.TrySetResult();
        }
    }

    private void HandleMarketDataType(
        object?[] arguments)
    {
        if (arguments.Length >= 2 &&
            arguments[1] is int marketDataType)
        {
            _actualMarketDataType =
                marketDataType;
        }
    }

    private void HandleError(
        object?[] arguments)
    {
        if (arguments.Length == 0 ||
            arguments[0] is not int requestId)
        {
            return;
        }

        // Supports both old and new error callback signatures.
        var errorCode = arguments
            .Skip(1)
            .OfType<int>()
            .LastOrDefault();

        var message = arguments
            .OfType<string>()
            .FirstOrDefault()
            ?? "Unknown IBKR error.";
        if (errorCode is >= 2100 and < 2200)
        {
            _logger.LogDebug(
                "IBKR status {Code}: {Message}",
                errorCode,
                message);

            return;
        }

        // When delayed data was requested, these messages indicate
        // that live data is unavailable but delayed data will follow.
        // They must not terminate or cancel the request.
        if (_options.MarketDataType is 3 or 4 &&
    errorCode is 354 or 10091 or 10167)
        {
            _logger.LogInformation(
                "IBKR live data is unavailable for request {RequestId}; " +
                "waiting for delayed data. Code {Code}: {Message}",
                requestId,
                errorCode,
                message);

            return;
        }

        if (errorCode == 300)
        {
            _logger.LogDebug(
                "IBKR ticker {RequestId} was already removed.",
                requestId);

            return;
        }

        var exception = new IbkrException(
            $"IBKR error {errorCode}: {message}");

        if (_contractRequests.TryGetValue(
                requestId,
                out var contractRequest))
        {
            contractRequest.Completed.TrySetException(
                exception);
        }

        if (_marketDataRequests.TryGetValue(
                requestId,
                out var marketDataRequest))
        {
            marketDataRequest.Completed.TrySetException(
                exception);
        }

        if (requestId < 0)
        {
            _connected.TrySetException(
                exception);
        }
    }

    private void FailPendingRequests(
        string message)
    {
        var exception =
            new IbkrException(message);

        foreach (var request in
                 _contractRequests.Values)
        {
            request.Completed.TrySetException(
                exception);
        }

        foreach (var request in
                 _marketDataRequests.Values)
        {
            request.Completed.TrySetException(
                exception);
        }
    }

    private int NextRequestId() =>
        Interlocked.Increment(
            ref _nextRequestId);

    private void Disconnect()
    {
        _readerCancellation?.Cancel();

        if (_client?.IsConnected() == true)
            _client.eDisconnect();

        _signal?.issueSignal();
    }

    public async ValueTask DisposeAsync()
    {
        Disconnect();

        if (_readerTask is not null)
        {
            try
            {
                await _readerTask;
            }
            catch
            {
                // Connection is already shutting down.
            }
        }

        _readerCancellation?.Dispose();
        _connectionGate.Dispose();
    }

    private static TaskCompletionSource
        NewCompletionSource() =>
        new(
            TaskCreationOptions
                .RunContinuationsAsynchronously);

    private static string MarketDataTypeName(
        int marketDataType) =>
        marketDataType switch
        {
            1 => "live",
            2 => "frozen",
            3 => "delayed",
            4 => "delayed-frozen",
            _ => $"unknown-{marketDataType}"
        };

    private static void ValidateOptions(
        IbkrOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.Host))
            throw new InvalidOperationException(
                "The IBKR host is required.");

        if (options.Port is <= 0 or > 65_535)
            throw new InvalidOperationException(
                "The IBKR port is invalid.");

        if (options.ClientId < 0)
            throw new InvalidOperationException(
                "The IBKR client ID cannot be negative.");

        if (options.MarketDataType is < 1 or > 4)
            throw new InvalidOperationException(
                "IBKR market-data type must be between 1 and 4.");

        if (options.ConnectionTimeoutSeconds <= 0 ||
            options.SnapshotTimeoutSeconds <= 0)
        {
            throw new InvalidOperationException(
                "IBKR timeouts must be positive.");
        }
    }

    private sealed class ContractRequest
    {
        public List<Contract> Contracts { get; } = [];

        public TaskCompletionSource Completed { get; } =
            NewCompletionSource();
    }

    private sealed class MarketDataRequest
    {
        public MarketDataRequest(
            Contract contract)
        {
            Contract = contract;
        }

        public Contract Contract { get; }

        public double? Bid { get; set; }
        public double? Ask { get; set; }
        public double? Last { get; set; }
        public double? Close { get; set; }

        public bool HasUsablePrice =>
    (Bid.HasValue && Ask.HasValue) ||
    Last.HasValue ||
    Close.HasValue;

        public TaskCompletionSource Completed { get; } =
            NewCompletionSource();

        public IbkrMarketSnapshot CreateSnapshot()
        {
            if (Bid is null &&
                Ask is null &&
                Last is null &&
                Close is null)
            {
                throw new IbkrException(
                    $"IBKR returned no usable prices for " +
                    $"{Contract.LocalSymbol ?? Contract.Symbol}.");
            }

            double? midpoint =
                Bid.HasValue &&
                Ask.HasValue
                    ? (Bid.Value + Ask.Value) / 2.0
                    : null;

            return new IbkrMarketSnapshot(
                Contract.ConId,
                Contract.Symbol,
                Contract.LocalSymbol,
                Contract.SecType,
                Contract.Exchange,
                Contract.Currency,
                Bid,
                Ask,
                Last,
                Close,
                midpoint);
        }
    }
}

// DispatchProxy creates the EWrapper implementation dynamically,
// avoiding hundreds of unused order/account callbacks.
public class IbkrCallbackProxy : DispatchProxy
{
    public Action<string, object?[]>? Callback { get; set; }

    protected override object? Invoke(
        MethodInfo? targetMethod,
        object?[]? arguments)
    {
        if (targetMethod is not null)
        {
            Callback?.Invoke(
                targetMethod.Name,
                arguments ?? []);
        }

        if (targetMethod is null ||
            targetMethod.ReturnType == typeof(void))
        {
            return null;
        }

        return targetMethod.ReturnType.IsValueType
            ? Activator.CreateInstance(
                targetMethod.ReturnType)
            : null;
    }
}