namespace QuantWebApi.MarketData;

public sealed record IbkrOptionSnapshot(
    IbkrMarketSnapshot Underlying,
    IbkrMarketSnapshot Option,
    string Expiry,
    double Strike,
    string OptionType,
    DateTimeOffset TimestampUtc,
    int MarketDataTypeCode,
    string MarketDataType);