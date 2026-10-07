#pragma once
#include <cstddef>
#include <istream>
#include <string>
#include <vector>

namespace quant::strategies {
struct DailyBar { std::string date; double open, close; };
struct BacktestSettings {
    std::size_t fastWindow = 20, slowWindow = 50;
    double initialCash = 10000;
    double allocation = 0.95; // Fraction of available cash allocated on entry.
    double feeBps = 5, slippageBps = 5;
};
struct Trade {
    std::string signalDate, executionDate;
    bool buy;
    double shares, price, fee;
};
struct EquityPoint { std::string date; double cash, shares, equity, benchmarkEquity; };
struct BacktestResult {
    std::size_t warmupBars = 0;
    double benchmarkAllocation = 0;
    double finalEquity, totalReturn, benchmarkReturn, maxDrawdown, totalFees;
    std::vector<Trade> trades;
    std::vector<EquityPoint> equity;
};
class Strategy;
struct ExecutionSettings { double initialCash; double allocation; double feeBps; double slippageBps; };
BacktestResult backtest(const std::vector<DailyBar>& bars, Strategy& strategy, const ExecutionSettings& settings);
// Strict date,open,close CSV. All prices must use a consistent adjustment basis.
std::vector<DailyBar> readDailyBars(std::istream& input);
// Long/cash regime: fast SMA > slow SMA. Signals at close, fills next open.
BacktestResult backtestMovingAverage(const std::vector<DailyBar>& bars,
    const BacktestSettings& settings = {});
}
