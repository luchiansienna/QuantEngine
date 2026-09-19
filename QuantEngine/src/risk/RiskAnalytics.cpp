#include <quant/risk/RiskAnalytics.h>
#include <algorithm>
#include <cmath>
#include <numeric>
#include <random>
#include <stdexcept>

namespace quant::risk {
namespace {
void range(double x, double lo, double hi) {
    if (!std::isfinite(x) || x < lo || x > hi) throw std::invalid_argument("Risk input out of range.");
}
void confidenceCheck(double p) { range(p, .5, .9999); }
// Inverse empirical CDF: nearest-rank convention, no interpolation.
double ranked(const std::vector<double>& sorted, double p) {
    return sorted[static_cast<std::size_t>(std::ceil(p * sorted.size())) - 1];
}
}
double quantile(std::vector<double> values, double confidence) {
    confidenceCheck(confidence);
    if (values.empty()) throw std::invalid_argument("Empty distribution.");
    for (double x : values) if (!std::isfinite(x)) throw std::invalid_argument("Non-finite observation.");
    std::sort(values.begin(), values.end());
    return ranked(values, confidence);
}
LossRisk lossRisk(std::vector<double> losses, double confidence) {
    confidenceCheck(confidence);
    if (losses.empty() || losses.size() > 100000) throw std::invalid_argument("Supply 1 to 100000 observations.");
    for (double x : losses) if (!std::isfinite(x)) throw std::invalid_argument("Non-finite loss.");
    std::sort(losses.begin(), losses.end());
    // Integral of the empirical quantile over the worst (1-p) mass.
    // Fractional boundary weight avoids tie-dependent ES or excess tail mass.
    const double tail = losses.size() * (1 - confidence);
    double remaining = tail, sum = 0;
    for (auto it = losses.rbegin(); it != losses.rend() && remaining > 0; ++it) {
        const double weight = std::min(1.0, remaining);
        sum += weight * *it;
        remaining -= weight;
    }
    return {ranked(losses, confidence), sum / tail, static_cast<int>(losses.size())};
}
SimulationResult simulate(const SimulationInput& x) {
    range(x.spot, .0001, 1e6); range(x.rate, -.1, .5); range(x.dividendYield, 0, .5);
    range(x.volatility, 0, 2); range(x.maturity, .01, 30); confidenceCheck(x.confidence);
    range(x.physicalDrift, -.5, .5); range(x.horizonDays, 1, 252);
    range(x.collateral, 0, 1e12); range(x.hazardRate, 0, 5); range(x.recovery, 0, 1);
    if (x.paths < 100 || x.paths > 100000 || x.steps < 1 || x.steps > 120 ||
        static_cast<long long>(x.paths) * x.steps > 2000000 || x.trades.empty() || x.trades.size() > 100 ||
        x.horizonDays / 252.0 > x.maturity)
        throw std::invalid_argument("Invalid simulation size or horizon beyond maturity.");
    double quantity = 0, strikeCash = 0;
    for (const auto& t : x.trades) {
        range(t.quantity, -1e8, 1e8); range(t.strike, .0001, 1e6);
        quantity += t.quantity; strikeCash += t.quantity * t.strike;
    }
    const auto value = [&](double spot, double remaining) {
        return quantity * spot * std::exp(-x.dividendYield * remaining) - strikeCash * std::exp(-x.rate * remaining);
    };
    SimulationResult result{};
    result.cleanValue = value(x.spot, x.maturity);
    result.profile.push_back({0, std::max(result.cleanValue - x.collateral, 0.0), std::max(result.cleanValue - x.collateral, 0.0)});
    result.peakPfe = result.profile.front().pfe;
    std::mt19937 exposureRng(x.seed), marketRng(x.seed ^ 0x9e3779b9U);
    std::normal_distribution<double> exposureNormal, marketNormal;
    std::vector<double> spots(x.paths, x.spot), exposures(x.paths), losses(x.paths);
    const double dt = x.maturity / x.steps;
    // Q drift for exposure/CVA. Exposure is measured immediately before final settlement.
    for (int step = 1; step <= x.steps; ++step) {
        const double t = step * dt;
        for (int path = 0; path < x.paths; ++path) {
            spots[path] *= std::exp((x.rate - x.dividendYield - .5*x.volatility*x.volatility)*dt + x.volatility*std::sqrt(dt)*exposureNormal(exposureRng));
            exposures[path] = std::max(value(spots[path], std::max(0.0, x.maturity - t)) - x.collateral, 0.0);
        }
        const double ee = std::accumulate(exposures.begin(), exposures.end(), 0.0) / x.paths;
        const double pfe = quantile(exposures, x.confidence);
        result.profile.push_back({t, ee, pfe});
        result.peakPfe = std::max(result.peakPfe, pfe);
        // Right-endpoint exposure quadrature; interval marginal default probability.
        const double marginalPd = std::exp(-x.hazardRate * (t-dt)) - std::exp(-x.hazardRate*t);
        result.cva += (1-x.recovery) * std::exp(-x.rate*t) * ee * marginalPd;
    }
    const double horizon = x.horizonDays / 252.0;
    for (int path = 0; path < x.paths; ++path) {
        const double spot = x.spot * std::exp((x.physicalDrift-x.dividendYield-.5*x.volatility*x.volatility)*horizon + x.volatility*std::sqrt(horizon)*marketNormal(marketRng));
        // Undiscounted horizon mark-to-market P&L, no financing/carry adjustment.
        losses[path] = result.cleanValue - value(spot, x.maturity-horizon);
    }
    result.marketRisk = lossRisk(losses, x.confidence);
    result.adjustedValue = result.cleanValue - result.cva;
    return result;
}
CreditBondResult priceCreditBond(double face, double coupon, double maturity,
    int frequency, double rate, double hazard, double recovery) {
    range(face, .01, 1e12); range(coupon, 0, 1); range(maturity, .01, 30);
    range(rate, -.1, .5); range(hazard, 0, 5); range(recovery, 0, 1);
    if (frequency != 1 && frequency != 2 && frequency != 4 && frequency != 12) throw std::invalid_argument("Unsupported frequency.");
    const double periods = maturity * frequency;
    if (std::abs(periods - std::round(periods)) > 1e-8) throw std::invalid_argument("Maturity must contain whole coupon periods.");
    CreditBondResult result{};
    const int count = static_cast<int>(std::round(periods));
    if (count < 1) throw std::invalid_argument("At least one coupon period required.");
    for (int i=1; i<=count; ++i) {
        const double t = double(i)/frequency;
        const double cf = face * coupon/frequency + (i==count ? face : 0);
        result.riskFreePrice += cf * std::exp(-rate*t);
        result.riskyPrice += cf * std::exp(-(rate+hazard)*t);
    }
    // Fractional recovery of par paid at default: exact flat-curve integral.
    const double a = rate + hazard;
    const double integral = std::abs(a) < 1e-10 ? maturity : -std::expm1(-a*maturity)/a;
    result.riskyPrice += recovery * face * hazard * integral;
    result.creditAdjustment = result.riskFreePrice - result.riskyPrice;
    result.defaultProbability = -std::expm1(-hazard*maturity);
    return result;
}
}
