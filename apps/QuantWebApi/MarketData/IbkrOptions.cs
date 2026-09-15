namespace QuantWebApi.MarketData;

public sealed class IbkrOptions
{
    public const string SectionName = "Ibkr";

    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 7496;
    public int ClientId { get; set; } = 41;

    // 1 = live, 2 = frozen, 3 = delayed, 4 = delayed-frozen
    public int MarketDataType { get; set; } = 1;

    public int ConnectionTimeoutSeconds { get; set; } = 10;
    public int SnapshotTimeoutSeconds { get; set; } = 15;
}