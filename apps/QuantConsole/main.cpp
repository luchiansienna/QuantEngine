#include <iomanip>
#include <iostream>
#include <string_view>
#include <vector>

#include <quant/instruments/EuropeanOption.h>
#include <quant/pricing/BlackScholes.h>
#include <quant/pricing/ImpliedVolatility.h>

#include <quant/fixed_income/Bond.h>
#include <quant/fixed_income/Cashflow.h>
#include <quant/fixed_income/Convexity.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/Duration.h>
#include <quant/fixed_income/DV01.h>
#include <quant/fixed_income/FixedIncomePortfolio.h>
#include <quant/fixed_income/PortfolioRisk.h>
#include <quant/fixed_income/RateScenarioEngine.h>
#include <quant/fixed_income/YieldCurve.h>
#include <quant/fixed_income/YieldToMaturity.h>

namespace
{
    void printSection(
        const std::string_view title,
        const std::string_view explanation)
    {
        std::cout
            << "\n" << title << '\n'
            << std::string(title.size(), '-') << '\n'
            << explanation << "\n\n";
    }
}

int main()
{
    using namespace quant;
    using namespace quant::pricing;
    using namespace quant::fixed_income;

    std::cout
        << std::fixed
        << std::setprecision(4);

    printSection(
        "OPTION PRICING AND GREEKS",
        "Black-Scholes fair value and sensitivities for a European call option.");

    const EuropeanOption option(
        OptionType::Call,
        100.0, // Spot price
        100.0, // Strike price
        0.05,  // Risk-free rate
        0.20,  // Volatility
        1.0);  // Time to maturity

    constexpr double marketPrice = 10.4506;

    const double impliedVolatility =
        ImpliedVolatility::calculate(option, marketPrice);

    std::cout
        << "Option price (estimated fair value): "
        << BlackScholes::price(option) << '\n'
        << "Delta (price change for a 1-unit move in the underlying): "
        << BlackScholes::delta(option) << '\n'
        << "Gamma (how much Delta changes as the underlying moves): "
        << BlackScholes::gamma(option) << '\n'
        << "Vega (price change for a 1 percentage-point volatility move): "
        << BlackScholes::vega(option) << '\n'
        << "Theta (estimated value lost per day as time passes): "
        << BlackScholes::theta(option) << '\n'
        << "Rho (price sensitivity to interest-rate changes): "
        << BlackScholes::rho(option) << '\n'
        << "Implied volatility (volatility implied by the market price): "
        << impliedVolatility * 100.0 << "%\n";

    const std::vector<Cashflow> cashflows{
        {1.0, 50.0},
        {2.0, 50.0},
        {3.0, 50.0},
        {4.0, 50.0},
        {5.0, 1050.0}
    };

    const double pv =
        Discounting::presentValue(cashflows, 0.05);

    printSection(
        "BOND PRESENT VALUE",
        "Today's value of the bond's future coupons and principal payment.");

    std::cout
        << "Present value (all future cashflows discounted to today): "
        << pv << '\n';

    const Bond annualBond(
        1000.0,
        0.05,
        5.0,
        1);

    const auto annualCashflows = annualBond.cashflows();

    printSection(
        "ANNUAL BOND CASHFLOW SCHEDULE",
        "The bond pays one coupon each year and repays principal at maturity.");

    for (const auto& cashflow : annualCashflows)
    {
        std::cout
            << "Payment time: " << cashflow.time
            << " years | Cashflow amount: " << cashflow.amount
            << '\n';
    }

    const Bond semiAnnualBond(
        1000.0,
        0.05,
        5.0,
        2);

    const auto semiAnnualCashflows = semiAnnualBond.cashflows();

    printSection(
        "SEMI-ANNUAL BOND CASHFLOW SCHEDULE",
        "The bond pays two coupons per year and repays principal at maturity.");

    for (const auto& cashflow : semiAnnualCashflows)
    {
        std::cout
            << "Payment time: " << cashflow.time
            << " years | Cashflow amount: " << cashflow.amount
            << '\n';
    }

    const Bond ytmBond(
        1000.0,
        0.05,
        5.0,
        1);

    const double parYtm =
        YieldToMaturity::calculate(ytmBond, 1000.0);

    const double discountYtm =
        YieldToMaturity::calculate(ytmBond, 950.0);

    const double premiumYtm =
        YieldToMaturity::calculate(ytmBond, 1050.0);

    printSection(
        "YIELD TO MATURITY",
        "Annual return if the bond is held to maturity and all payments are made.");

    std::cout
        << "At par (price equals face value): "
        << parYtm * 100.0 << "%\n"
        << "At a discount (price 950 is below face value): "
        << discountYtm * 100.0 << "%\n"
        << "At a premium (price 1050 is above face value): "
        << premiumYtm * 100.0 << "%\n";

    const Bond riskBond(
        1000.0,
        0.05,
        5.0,
        1);

    constexpr double yield = 0.05;

    const double macaulayDuration =
        Duration::macaulay(riskBond, yield);

    const double modifiedDuration =
        Duration::modified(riskBond, yield);

    const double dv01 =
        DV01::calculate(riskBond, yield);

    const double convexity =
        Convexity::calculate(riskBond, yield);

    printSection(
        "BOND INTEREST-RATE RISK",
        "Measures when cashflows arrive and how the bond price reacts to rate moves.");

    std::cout
        << "Macaulay duration (weighted average time to receive cashflows): "
        << macaulayDuration << " years\n"
        << "Modified duration (approximate % price sensitivity to a 1% rate move): "
        << modifiedDuration << '\n'
        << "DV01 (money gained or lost for a 1-basis-point rate move): "
        << dv01 << '\n'
        << "Convexity (how much the bond's rate sensitivity changes): "
        << convexity << '\n';

    const std::vector<double> shocks{
        -100.0,
        -50.0,
        -10.0,
        10.0,
        50.0,
        100.0
    };

    const auto scenarios =
        RateScenarioEngine::runMany(riskBond, yield, shocks);

    printSection(
        "INTEREST-RATE SCENARIOS",
        "Negative shocks mean falling rates; positive shocks mean rising rates.");

    std::cout
        << "Exact P&L fully reprices the bond. Duration and convexity provide estimates.\n\n"
        << std::left
        << std::setw(12) << "Shock(bp)"
        << std::setw(12) << "Yield(%)"
        << std::setw(14) << "Price"
        << std::setw(14) << "Exact P&L"
        << std::setw(16) << "Duration est."
        << std::setw(18) << "Dur+Conv est."
        << '\n'
        << std::string(86, '-') << '\n';

    for (const auto& scenario : scenarios)
    {
        std::cout
            << std::left
            << std::setw(12) << scenario.shockBasisPoints
            << std::setw(12) << scenario.shockedYield * 100.0
            << std::setw(14) << scenario.shockedPrice
            << std::setw(14) << scenario.exactPnl
            << std::setw(16) << scenario.durationPnl
            << std::setw(18) << scenario.durationConvexityPnl
            << '\n';
    }

    FixedIncomePortfolio portfolio;

    portfolio.add({
        Bond(1000.0, 0.05, 5.0, 1),
        100.0,
        0.05
        });

    portfolio.add({
        Bond(1000.0, 0.04, 10.0, 1),
        50.0,
        0.045
        });

    const double portfolioValue =
        PortfolioRisk::marketValue(portfolio);

    const double portfolioDv01 =
        PortfolioRisk::dv01(portfolio);

    const double pnlPlus100bp =
        PortfolioRisk::scenarioPnl(portfolio, 100.0);

    printSection(
        "FIXED-INCOME PORTFOLIO RISK",
        "Aggregated value and interest-rate sensitivity of all bond positions.");

    std::cout
        << "Portfolio market value (current value of all positions): "
        << portfolioValue << '\n'
        << "Portfolio DV01 (money sensitivity to a 1-bp rate move): "
        << portfolioDv01 << '\n'
        << "Portfolio P&L after all rates rise by 100 bp: "
        << pnlPlus100bp << '\n';

    const YieldCurve yieldCurve({
        {1.0, 0.0400},
        {2.0, 0.0410},
        {5.0, 0.0440},
        {10.0, 0.0460}
        });

    printSection(
        "YIELD CURVE ANALYSIS",
        "Rates by maturity, future-cashflow discounting, and rate-shift scenarios.");

    std::cout
        << "3Y interpolated rate (estimated between known curve points): "
        << yieldCurve.rate(3.0) * 100.0 << "%\n"
        << "3Y discount factor (today's value of 1 unit received in 3 years): "
        << yieldCurve.discountFactor(3.0) << '\n';

    const YieldCurve shiftedCurve =
        yieldCurve.parallelShift(100.0);

    std::cout
        << "3Y rate after +100-bp parallel shift (all rates rise by 1%): "
        << shiftedCurve.rate(3.0) * 100.0 << "%\n";

    return 0;
}