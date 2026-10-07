namespace QuantWebApi.Strategies;

public sealed record StrategyParameter(string Key, string Label, double Default, double Min, double Max, double Step = 1);
public sealed record StockAlgorithm(string Id, string Name, string AssetClass, string Description, StrategyParameter[] Parameters);

public static class StockStrategyCatalog
{
    public static readonly StockAlgorithm[] Algorithms = [
        new("sma-long-cash", "Moving average · long / cash", "Stocks",
            "Hold shares when fast SMA > slow SMA; otherwise hold cash. Signals execute at the next session's open.",
            [new("fastWindow", "Fast SMA (sessions)", 20, 1, 1999), new("slowWindow", "Slow SMA (sessions)", 50, 2, 2000)]),
        new("momentum-long-cash", "Momentum · long / cash", "Stocks",
            "Hold shares when the close exceeds the close lookback sessions ago; otherwise hold cash. Signals execute next open.",
            [new("lookback", "Lookback (sessions)", 126, 1, 2000)]),
        new("rsi-mean-reversion", "RSI mean reversion", "Stocks",
            "Buy when RSI is below entry and price is above its trend SMA. Exit when RSI exceeds the exit threshold, at next open.",
            [new("rsiPeriod", "RSI period", 2, 1, 100), new("trendWindow", "Trend SMA (sessions)", 200, 1, 2000),
             new("entryBelow", "Entry RSI below", 10, .01, 99.99, .01), new("exitAbove", "Exit RSI above", 70, .01, 99.99, .01)])
    ];
}
