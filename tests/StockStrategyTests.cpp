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
    std::cout << "Stock strategy checks passed\n";
} catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
}
