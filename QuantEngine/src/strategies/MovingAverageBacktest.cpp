#include <quant/strategies/MovingAverageBacktest.h>
#include <quant/strategies/Strategies.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace quant::strategies {
    namespace {
        void require(bool condition, const char* message) {
            if (!condition) throw std::invalid_argument(message);
        }
        bool validDate(const std::string& date) {
            if (date.size() != 10 || date[4] != '-' || date[7] != '-') return false;
            for (std::size_t i = 0; i < date.size(); ++i)
                if (i != 4 && i != 7 && (date[i] < '0' || date[i] > '9')) return false;
            const int y = std::stoi(date.substr(0, 4));
            return y >= 1900 && std::chrono::year_month_day{
                std::chrono::year{ y }, std::chrono::month{ static_cast<unsigned>(std::stoi(date.substr(5, 2))) },
                std::chrono::day{ static_cast<unsigned>(std::stoi(date.substr(8, 2))) } }.ok();
        }
        void validateBar(const DailyBar& bar, const std::string& previous) {
            require(validDate(bar.date) && bar.date > previous, "Dates must be valid, unique and ascending (YYYY-MM-DD).");
            require(std::isfinite(bar.open) && std::isfinite(bar.close) &&
                bar.open >= 1e-6 && bar.close >= 1e-6 && bar.open <= 1e9 && bar.close <= 1e9,
                "Prices must be finite and between 0.000001 and 1e9.");
        }
        double number(const std::string& text) {
            std::size_t used = 0;
            const double value = std::stod(text, &used);
            require(used == text.size(), "Invalid CSV number.");
            return value;
        }
    }
    std::vector<DailyBar> readDailyBars(std::istream& input) {
        std::string line;
        require(static_cast<bool>(std::getline(input, line)), "CSV is empty.");
        if (!line.empty() && line.back() == '\r') line.pop_back();
        require(line == "date,open,close", "Expected CSV header: date,open,close");
        std::vector<DailyBar> bars;
        while (std::getline(input, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            const auto first = line.find(','), second = line.find(',', first == std::string::npos ? 0 : first + 1);
            require(first != std::string::npos && second != std::string::npos &&
                line.find(',', second + 1) == std::string::npos, "Expected exactly three CSV columns.");
            DailyBar bar{ line.substr(0, first), number(line.substr(first + 1, second - first - 1)), number(line.substr(second + 1)) };
            validateBar(bar, bars.empty() ? "" : bars.back().date);
            require(bars.size() < 1000000, "CSV exceeds one million bars.");
            bars.push_back(bar);
        }
        require(!input.bad(), "Could not read CSV.");
        return bars;
    }

    // Strategy-agnostic simulator: fills, fees, slippage, equity curve and the
    // buy-and-hold benchmark are shared by every strategy.
    BacktestResult backtest(const std::vector<DailyBar>& bars, Strategy& strategy, const ExecutionSettings& s) {
        require(strategy.warmup() > 0 && strategy.warmup() < bars.size(),
            "Not enough bars for the strategy's warm-up period.");
        require(bars.size() <= 1000000, "Too many bars.");
        require(std::isfinite(s.initialCash) && s.initialCash > 0 && s.initialCash <= 1e12,
            "Initial cash must be in (0, 1e12].");
        require(std::isfinite(s.allocation) && s.allocation > 0 && s.allocation <= 1,
            "Allocation must be in (0, 1].");
        require(std::isfinite(s.feeBps) && s.feeBps >= 0 && s.feeBps <= 1000 &&
            std::isfinite(s.slippageBps) && s.slippageBps >= 0 && s.slippageBps <= 1000,
            "Costs must be finite and between 0 and 1000 bps.");
        for (std::size_t i = 0; i < bars.size(); ++i) validateBar(bars[i], i ? bars[i - 1].date : "");

        BacktestResult result{};
        double cash = s.initialCash, shares = 0, peak = cash;
        double benchmarkCash = cash, benchmarkShares = 0;
        const double feeRate = s.feeBps / 10000, slip = s.slippageBps / 10000;
        const std::size_t benchmarkStart = strategy.warmup();
        result.warmupBars = benchmarkStart;
        const double benchmarkBudget = strategy.entryBudget(s.initialCash, s.allocation);
        require(std::isfinite(benchmarkBudget) && benchmarkBudget > 0 && benchmarkBudget <= s.initialCash,
            "Invalid strategy entry budget.");
        result.benchmarkAllocation = benchmarkBudget / s.initialCash;
        double entryCost = 0;
        bool pendingLong = false;
        for (std::size_t i = 0; i < bars.size(); ++i) {
            const auto& bar = bars[i];
            // Only yesterday's decision is available at today's open.
            if (pendingLong && shares == 0) {
                const double price = bar.open * (1 + slip);
                const double budget = strategy.entryBudget(cash, s.allocation);
                require(std::isfinite(budget) && budget > 0 && budget <= cash, "Invalid strategy entry budget.");
                entryCost = budget;
                shares = budget / (price * (1 + feeRate)); // Fractional shares, no leverage.
                const double fee = shares * price * feeRate;
                cash -= budget;
                result.totalFees += fee;
                result.trades.push_back({ bars[i - 1].date, bar.date, true, shares, price, fee });
            }
            else if (!pendingLong && shares > 0) {
                const double price = bar.open * (1 - slip);
                const double fee = shares * price * feeRate;
                const double proceeds = shares * price - fee;
                cash += proceeds;
                result.totalFees += fee;
                result.trades.push_back({ bars[i - 1].date, bar.date, false, shares, price, fee });
                shares = 0;
                strategy.onRoundTripClosed(proceeds - entryCost, cash);
            }
            // Same first eligible execution day, initial stake and entry costs.
            if (i == benchmarkStart) {
                const double budget = benchmarkBudget;
                benchmarkShares = budget / (bar.open * (1 + slip) * (1 + feeRate));
                benchmarkCash -= budget;
            }
            const double equity = cash + shares * bar.close;
            peak = std::max(peak, equity);
            result.maxDrawdown = std::max(result.maxDrawdown, (peak - equity) / peak);
            result.equity.push_back({ bar.date, cash, shares, equity, benchmarkCash + benchmarkShares * bar.close });
            // Decision for tomorrow's open, made from data up to and including today's close.
            const bool decision = strategy.onClose(bar, shares > 0);
            pendingLong = i + 1 >= benchmarkStart && decision;
        }
        result.finalEquity = result.equity.back().equity;
        result.totalReturn = result.finalEquity / s.initialCash - 1;
        result.benchmarkReturn = result.equity.back().benchmarkEquity / s.initialCash - 1;
        return result;
    }

    // Kept so existing callers and tests keep working.
    BacktestResult backtestMovingAverage(const std::vector<DailyBar>& bars, const BacktestSettings& s) {
        require(s.fastWindow > 0 && s.fastWindow < s.slowWindow && s.slowWindow < bars.size(),
            "Require 0 < fast < slow < number of bars.");
        SmaCrossStrategy strategy(s.fastWindow, s.slowWindow);
        return backtest(bars, strategy, { s.initialCash, s.allocation, s.feeBps, s.slippageBps });
    }
}
