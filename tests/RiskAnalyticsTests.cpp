#include <quant/risk/RiskAnalytics.h>
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
using namespace quant::risk;
int checks = 0;
void check(bool ok, const char* label) { ++checks; if (!ok) throw std::runtime_error(label); }
void near(double a, double b, double tolerance, const char* label) { check(std::abs(a-b)<=tolerance, label); }
template<class F> void rejects(F f, const char* label) { bool threw=false; try { f(); } catch(const std::invalid_argument&) { threw=true; } check(threw,label); }
int main() {
    auto tail = lossRisk({1,2,3,4,5,6,7,8,9,10}, .85);
    near(tail.var,9,1e-12,"nearest-rank VaR"); near(tail.expectedShortfall,29.0/3,1e-12,"fractional ES tail");
    near(lossRisk({-3,-2,-1},.95).var,-1,1e-12,"negative VaR retained");
    near(lossRisk({1,1,1,5},.5).expectedShortfall,3,1e-12,"ES handles ties");
    rejects([]{quantile({},.95);},"empty observations rejected");
    rejects([]{lossRisk({std::numeric_limits<double>::infinity()},.95);},"infinite observations rejected");
    rejects([]{quantile({1},1);},"confidence one rejected");
    auto bond=priceCreditBond(1000,.05,5,2,.03,0,.4);
    near(bond.riskFreePrice,bond.riskyPrice,1e-10,"zero hazard equals risk-free");
    near(bond.defaultProbability,0,1e-12,"zero hazard zero PD");
    auto zero=priceCreditBond(1000,0,5,1,.03,.02,0);
    near(zero.riskyPrice,1000*std::exp(-.25),1e-10,"zero recovery zero coupon analytic");
    auto recover=priceCreditBond(1000,0,5,1,.03,.02,.4);
    near(recover.riskyPrice,1000*std::exp(-.25)+400*.02*(1-std::exp(-.25))/.05,1e-10,"recovery at default analytic integral");
    near(priceCreditBond(1000,0,5,1,-.02,.02,.4).riskyPrice,1040,1e-10,"zero rate-plus-hazard integral limit");
    rejects([]{priceCreditBond(1000,.05,1.1,2,.03,.02,.4);},"stub periods rejected");
    SimulationInput x; x.paths=20000; x.steps=24;
    const auto a=simulate(x), b=simulate(x);
    near(a.peakPfe,b.peakPfe,0,"seed repeatability");
    near(a.marketRisk.var,b.marketRisk.var,0,"market seed repeatability");
    near(a.adjustedValue,a.cleanValue-a.cva,1e-10,"CVA adjusted price");
    check(a.marketRisk.expectedShortfall>=a.marketRisk.var,"ES at least VaR");
    x.hazardRate=0; near(simulate(x).cva,0,1e-12,"no default means no CVA");
    x.hazardRate=.02; x.recovery=1; near(simulate(x).cva,0,1e-12,"full recovery zero CVA"); x.recovery=.4;
    x.trades={{1000,100},{-1000,100}};
    auto net=simulate(x); near(net.peakPfe,0,1e-12,"offsetting trades net before positive part"); near(net.cva,0,1e-12,"offsetting CVA"); near(net.marketRisk.var,0,1e-12,"offsetting market risk");
    x.trades={{1000,100}}; x.collateral=1e9;
    near(simulate(x).peakPfe,0,1e-12,"large fixed collateral eliminates sampled exposure");
    x.collateral=0; x.volatility=0;
    auto deterministic=simulate(x);
    near(deterministic.profile.back().pfe,1000*(100*std::exp(.03)-100),1e-7,"zero-volatility terminal exposure");
    near(deterministic.profile.back().pfe,deterministic.profile.back().expectedExposure,1e-6,"deterministic mean equals percentile");
    x.volatility=.2; x.paths=100000; x.steps=1;
    auto terminal=simulate(x).profile.back();
    // Known N(0,1) 95th percentile; GBM terminal quantile benchmark.
    const double analyticPfe=1000*(100*std::exp((.03-.5*.2*.2)+.2*1.6448536269514722)-100);
    near(terminal.pfe,analyticPfe,900,"MC PFE vs lognormal analytic benchmark");
    // Terminal expected positive forward payoff equals undiscounted BS call.
    const auto N=[](double z){return .5*std::erfc(-z/std::sqrt(2.0));};
    const double analyticEe=1000*(100*std::exp(.03)*N(.25)-100*N(.05));
    near(terminal.expectedExposure,analyticEe,250,"MC EE vs analytic forward payoff");
    x.paths=100; x.steps=12; x.maturity=.01;
    rejects([&]{simulate(x);},"horizon beyond maturity rejected");
    x.maturity=1; x.paths=100000; x.steps=120;
    rejects([&]{simulate(x);},"work limit enforced");
    std::cout << checks << " native risk checks passed\n";
}
