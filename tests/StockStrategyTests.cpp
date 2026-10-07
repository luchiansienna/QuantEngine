#include <quant/strategies/Strategies.h>
#include "../apps/QuantCli/BacktestCommand.h"
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>

using namespace quant::strategies;
void check(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
template<class F> void reject(F action) {
    bool threw = false;
    try { action(); } catch (const std::invalid_argument&) { threw = true; }
    check(threw, "invalid input accepted");
}
int main() try {
    std::vector<DailyBar> bars{{"2021-01-01",100,100}, {"2021-01-02",100,110},
        {"2021-01-03",120,120}, {"2021-01-04",130,90}, {"2021-01-05",80,80}};
    ExecutionSettings settings{1000, 1, 0, 0};
    SmaCrossStrategy sma(1, 2);
    auto result = backtest(bars, sma, settings);
    check(result.trades.size() == 2, "SMA fill count");
    check(result.trades[0].signalDate == bars[1].date && result.trades[0].executionDate == bars[2].date,
        "SMA must fill after the signal close");
    check(result.trades[0].price == 120 && result.trades[1].price == 80, "next-open prices");
    check(std::abs(result.finalEquity - 1000.0 * 80 / 120) < 1e-8, "equity accounting");
    check(result.equity[1].benchmarkEquity == 1000, "benchmark must wait for warmup");
    MomentumStrategy momentum(1);
    auto momentumResult = backtest(bars, momentum, settings);
    check(momentumResult.trades[0].executionDate == bars[2].date, "momentum lookback timing");
    SmaCrossStrategy costlySma(1, 2);
    auto costly = backtest(bars, costlySma, {1000, 1, 5, 5});
    check(costly.totalFees > 0 && costly.finalEquity < result.finalEquity, "trading costs");
    for (const auto& point : costly.equity) check(point.cash >= -1e-8, "no leverage");
    RsiMeanReversionStrategy rsi(2, 3, 69, 70);
    double closes[]{100,110,100,110,109};
    check(!rsi.onClose({"",100,closes[0]}, false), "RSI warmup");
    check(!rsi.onClose({"",110,closes[1]}, false), "RSI seeding");
    check(!rsi.onClose({"",100,closes[2]}, false), "RSI trend filter");
    check(!rsi.onClose({"",110,closes[3]}, true), "RSI exits above 70");
    check(rsi.onClose({"",109,closes[4]}, false), "RSI entry after Wilder smoothing");
    reject([] { RollingWindow invalid(0); });
    reject([] { SmaCrossStrategy invalid(20, 20); });
    reject([] { MomentumStrategy invalid(0); });
    reject([] { RsiMeanReversionStrategy invalid(2, 200, 70, 10); });
    std::vector<std::string> tokens{"stock-backtest-v2", "momentum-long-cash", "1", "1", "1000", "1", "0", "0", "5"};
    for (const auto& bar : bars) { tokens.push_back(bar.date); tokens.push_back(std::to_string(bar.open)); tokens.push_back(std::to_string(bar.close)); }
    std::ostringstream json; writeBacktestStream(tokens, json);
    check(json.str().find("\"strategy\":\"momentum-long-cash\"") != std::string::npos &&
        json.str().find("\"parameters\":{\"lookback\":1}") != std::string::npos, "frontend result contract");
    tokens[2] = "4"; reject([&] { writeBacktestStream(tokens, json); });
    std::vector<DailyBar> cycles;
    const double opens[]{100,100,90,100,90,100,110,100};
    for (std::size_t i = 0; i < 8; ++i)
        cycles.push_back({"2021-02-0" + std::to_string(i + 1), opens[i], opens[i]});
    MartingaleStrategy martingale(10, 1, 6);
    const auto m = backtest(cycles, martingale, settings);
    check(m.trades.size() == 7, "martingale repeated round trips");
    check(m.trades[0].executionDate == cycles[1].date && m.trades[1].executionDate == cycles[2].date,
        "martingale close signals fill next open");
    const auto stake = [&](std::size_t i) { return m.trades[i].shares * m.trades[i].price + m.trades[i].fee; };
    check(std::abs(stake(0) - 100) < 1e-8 && std::abs(stake(2) - 200) < 1e-8 &&
        std::abs(stake(4) - 400) < 1e-8 && std::abs(stake(6) - 101) < 1e-8,
        "stakes double after losses and reset to current capital after profit");
    check(std::abs(m.benchmarkAllocation - .1) < 1e-8, "benchmark uses base stake");
    MartingaleStrategy limited(10, 1, 1);
    check(limited.entryBudget(1000, 1) == 100, "base stake");
    limited.onRoundTripClosed(-10, 990);
    check(limited.entryBudget(990, 1) == 200, "first doubling");
    limited.onRoundTripClosed(-20, 970);
    check(limited.entryBudget(970, 1) == 200, "doubling limit");
    check(limited.entryBudget(50, .5) == 25, "cash and allocation cap");
    limited.onRoundTripClosed(0, 970);
    check(limited.entryBudget(970, 1) == 200, "break-even keeps level");
    MartingaleStrategy noDoubling(10, 1, 0);
    noDoubling.entryBudget(1000, 1); noDoubling.onRoundTripClosed(-10, 990);
    check(noDoubling.entryBudget(990, 1) == 100, "zero doublings supported");
    std::vector<DailyBar> flat{{"2021-03-01",100,100}, {"2021-03-02",100,100},
        {"2021-03-03",100,100}, {"2021-03-04",100,100}};
    MartingaleStrategy feeLoss(10, 1, 2);
    const auto f = backtest(flat, feeLoss, {1000, 1, 5, 0});
    check(std::abs(f.trades[2].shares * f.trades[2].price + f.trades[2].fee - 200) < 1e-8,
        "fees count as a realized loss");
    MartingaleStrategy holding(10, 2, 2);
    const auto h = backtest(cycles, holding, settings);
    check(h.trades[1].executionDate == cycles[3].date, "holding session count");
    MartingaleStrategy drawdown(50, 1, 10);
    const auto d = backtest(cycles, drawdown, settings);
    for (const auto& point : d.equity) check(point.cash >= -1e-8 && std::isfinite(point.equity), "capped cash stays valid");
    reject([] { MartingaleStrategy invalid(0, 1, 2); });
    reject([] { MartingaleStrategy invalid(1, 0, 2); });
    reject([] { MartingaleStrategy invalid(1, 1, 11); });
    reject([&] { MartingaleStrategy invalid(10, 1, 2); backtest(cycles, invalid, {1000, .01, 0, 0}); });
    std::cout << "Stock strategy checks passed\n";
} catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
}
