#pragma once
#include <quant/strategies/MovingAverageBacktest.h>
#include <quant/strategies/Strategies.h>
#include <memory>
#include <utility>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <ostream>
#include <stdexcept>
#include <string>

inline void writeBacktestJson(const quant::strategies::ExecutionSettings& settings,
    const quant::strategies::BacktestResult& result, std::ostream& out,
    const std::string& strategy, const std::vector<std::pair<std::string, double>>& parameters) {
    out << std::setprecision(17)
        << "{\"strategy\":\"" << strategy << "\",\"parameters\":{";
    for (std::size_t i = 0; i < parameters.size(); ++i) {
        if (i) out << ',';
        out << '"' << parameters[i].first << "\":" << parameters[i].second;
    }
    out << "},\"warmupBars\":" << result.warmupBars
        << ",\"benchmarkAllocation\":" << result.benchmarkAllocation
        << ",\"initialCash\":" << settings.initialCash << ",\"allocation\":" << settings.allocation
        << ",\"feeBps\":" << settings.feeBps << ",\"slippageBps\":" << settings.slippageBps
        << ",\"finalEquity\":" << result.finalEquity << ",\"totalReturn\":" << result.totalReturn
        << ",\"benchmarkReturn\":" << result.benchmarkReturn
        << ",\"maxDrawdown\":" << result.maxDrawdown << ",\"totalFees\":" << result.totalFees
        << ",\"trades\":[";
    for (std::size_t i = 0; i < result.trades.size(); ++i) {
        const auto& t = result.trades[i];
        if (i) out << ',';
        out << "{\"signalDate\":\"" << t.signalDate << "\",\"executionDate\":\"" << t.executionDate
            << "\",\"side\":\"" << (t.buy ? "Buy" : "Sell") << "\",\"shares\":" << t.shares
            << ",\"price\":" << t.price << ",\"fee\":" << t.fee << '}';
    }
    out << "],\"equity\":[";
    for (std::size_t i = 0; i < result.equity.size(); ++i) {
        const auto& e = result.equity[i];
        if (i) out << ',';
        out << "{\"date\":\"" << e.date << "\",\"cash\":" << e.cash << ",\"shares\":" << e.shares
            << ",\"equity\":" << e.equity << ",\"benchmarkEquity\":" << e.benchmarkEquity << '}';
    }
    out << "]}";
}

inline void writeBacktestJson(const quant::strategies::BacktestSettings& settings,
    const quant::strategies::BacktestResult& result, std::ostream& out) {
    writeBacktestJson({settings.initialCash, settings.allocation, settings.feeBps, settings.slippageBps},
        result, out, "sma-long-cash", {{"fastWindow", static_cast<double>(settings.fastWindow)},
        {"slowWindow", static_cast<double>(settings.slowWindow)}});
}

inline void writeBacktestCommand(int argc, char* argv[], std::ostream& out) {
    using namespace quant::strategies;
    if (argc != 3 && argc != 9)
        throw std::invalid_argument("Usage: QuantCli backtest file.csv [fast slow cash allocation feeBps slippageBps]");
    BacktestSettings settings;
    auto numeric = [](const char* text) {
        std::size_t used = 0;
        const double value = std::stod(text, &used);
        if (used != std::string(text).size() || !std::isfinite(value))
            throw std::invalid_argument("Invalid backtest parameter.");
        return value;
    };
    if (argc == 9) {
        auto window = [&](const char* text) {
            const double n = numeric(text);
            if (n < 1 || n > 1000000 || n != std::floor(n))
                throw std::invalid_argument("Windows must be positive whole numbers up to one million.");
            return static_cast<std::size_t>(n);
        };
        settings.fastWindow = window(argv[3]); settings.slowWindow = window(argv[4]);
        settings.initialCash = numeric(argv[5]); settings.allocation = numeric(argv[6]);
        settings.feeBps = numeric(argv[7]); settings.slippageBps = numeric(argv[8]);
    }
    std::ifstream input(argv[2]);
    if (!input) throw std::invalid_argument("Cannot open historical CSV.");
    writeBacktestJson(settings, backtestMovingAverage(readDailyBars(input), settings), out);
    out << '\n';
}

// In-memory server protocol; no file paths or shell commands from API requests.
inline void writeBacktestStream(const std::vector<std::string>& tokens, std::ostream& out) {
    using namespace quant::strategies;
    if (tokens.size() < 8) throw std::invalid_argument("Incomplete backtest request.");
    auto number = [](const std::string& text) {
        std::size_t used = 0; const double value = std::stod(text, &used);
        if (used != text.size() || !std::isfinite(value)) throw std::invalid_argument("Invalid number.");
        return value;
    };
    auto count = [&](const std::string& text) {
        const double n = number(text);
        if (n < 1 || n > 5000 || n != std::floor(n)) throw std::invalid_argument("Invalid count.");
        return static_cast<std::size_t>(n);
    };
    if (tokens[0] == "stock-backtest-v2") {
        if (tokens.size() < 9) throw std::invalid_argument("Incomplete strategy request.");
        const auto& id = tokens[1];
        const auto parameterCount = count(tokens[2]);
        const std::size_t expected = id == "sma-long-cash" ? 2 : id == "momentum-long-cash" ? 1 : id == "rsi-mean-reversion" ? 4 : id == "martingale-long-cash" ? 3 : 0;
        if (!expected || parameterCount != expected || tokens.size() < 8 + expected)
            throw std::invalid_argument("Unsupported strategy or incorrect parameter count.");
        std::unique_ptr<Strategy> strategy;
        std::vector<std::pair<std::string, double>> parameters;
        if (id == "sma-long-cash") {
            const auto fast = count(tokens[3]), slow = count(tokens[4]);
            strategy = std::make_unique<SmaCrossStrategy>(fast, slow);
            parameters = {{"fastWindow", static_cast<double>(fast)}, {"slowWindow", static_cast<double>(slow)}};
        } else if (id == "momentum-long-cash") {
            const auto lookback = count(tokens[3]);
            strategy = std::make_unique<MomentumStrategy>(lookback);
            parameters = {{"lookback", static_cast<double>(lookback)}};
        } else if (id == "martingale-long-cash") {
            const double base = number(tokens[3]);
            const auto holding = count(tokens[4]);
            const double doublings = number(tokens[5]);
            if (doublings < 0 || doublings > 10 || doublings != std::floor(doublings))
                throw std::invalid_argument("Doublings must be a whole number from 0 to 10.");
            strategy = std::make_unique<MartingaleStrategy>(base, holding, static_cast<std::size_t>(doublings));
            parameters = {{"baseStakePct", base}, {"holdingSessions", static_cast<double>(holding)}, {"maxDoublings", doublings}};
        } else {
            const auto period = count(tokens[3]), trend = count(tokens[4]);
            const auto entry = number(tokens[5]), exit = number(tokens[6]);
            strategy = std::make_unique<RsiMeanReversionStrategy>(period, trend, entry, exit);
            parameters = {{"rsiPeriod", static_cast<double>(period)}, {"trendWindow", static_cast<double>(trend)},
                {"entryBelow", entry}, {"exitAbove", exit}};
        }
        const auto offset = 3 + expected;
        ExecutionSettings settings{number(tokens[offset]), number(tokens[offset + 1]),
            number(tokens[offset + 2]), number(tokens[offset + 3])};
        const auto n = count(tokens[offset + 4]);
        if (tokens.size() != offset + 5 + n * 3) throw std::invalid_argument("Incorrect bar count.");
        std::vector<DailyBar> bars; bars.reserve(n);
        for (std::size_t i = offset + 5; i < tokens.size(); i += 3)
            bars.push_back({tokens[i], number(tokens[i + 1]), number(tokens[i + 2])});
        writeBacktestJson(settings, backtest(bars, *strategy, settings), out, id, parameters);
        return;
    }
    BacktestSettings s{count(tokens[1]), count(tokens[2]), number(tokens[3]),
        number(tokens[4]), number(tokens[5]), number(tokens[6])};
    const auto n = count(tokens[7]);
    if (tokens.size() != 8 + n * 3) throw std::invalid_argument("Incorrect bar count.");
    std::vector<DailyBar> bars; bars.reserve(n);
    for (std::size_t i = 8; i < tokens.size(); i += 3)
        bars.push_back({tokens[i], number(tokens[i+1]), number(tokens[i+2])});
    writeBacktestJson(s, backtestMovingAverage(bars, s), out);
}
