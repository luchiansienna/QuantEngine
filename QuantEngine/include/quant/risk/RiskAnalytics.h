#pragma once
#include <cstdint>
#include <vector>

namespace quant::risk {
// One currency, one underlying, one legally enforceable netting set.
struct Forward { double quantity; double strike; };
struct SimulationInput {
    double spot = 100, rate = .03, dividendYield = 0, volatility = .2;
    double maturity = 1, confidence = .95, physicalDrift = .05;
    double horizonDays = 10, collateral = 0, hazardRate = .02, recovery = .4;
    int paths = 10000, steps = 12;
    std::uint32_t seed = 42;
    std::vector<Forward> trades{{1000, 100}};
};
struct ExposurePoint { double time, expectedExposure, pfe; };
struct LossRisk { double var, expectedShortfall; int observations; };
struct SimulationResult {
    double cleanValue, cva, adjustedValue, peakPfe;
    LossRisk marketRisk;
    std::vector<ExposurePoint> profile;
};
double quantile(std::vector<double> values, double confidence);
LossRisk lossRisk(std::vector<double> losses, double confidence);
SimulationResult simulate(const SimulationInput& input);
struct CreditBondResult { double riskFreePrice, riskyPrice, creditAdjustment, defaultProbability; };
CreditBondResult priceCreditBond(double face, double coupon, double maturity,
    int frequency, double rate, double hazard, double recovery);
}
