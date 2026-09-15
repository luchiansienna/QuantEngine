namespace QuantWebApi.MarketData;

public sealed record IbkrMarketSnapshot(
    int ContractId,
    string Symbol,
    string? LocalSymbol,
    string SecurityType,
    string Exchange,
    string Currency,
    double? Bid,
    double? Ask,
    double? Last,
    double? Close,
    double? Midpoint)
{
    public double? PreferredPrice =>
        Midpoint ??
        Last ??
        Close ??
        Bid ??
        Ask;
}