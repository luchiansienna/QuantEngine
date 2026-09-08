#include <iostream>
#include <iomanip>

#include <quant/instruments/EuropeanOption.h>
#include <quant/pricing/BlackScholes.h>
#include <quant/pricing/ImpliedVolatility.h>
#include <vector>

#include <quant/fixed_income/Cashflow.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/Bond.h>
#include <quant/fixed_income/YieldToMaturity.h>
#include <quant/fixed_income/Duration.h>
#include <quant/fixed_income/DV01.h>
#include <quant/fixed_income/Convexity.h>
#include <quant/fixed_income/RateScenarioEngine.h>

#include <quant/fixed_income/FixedIncomePortfolio.h>
#include <quant/fixed_income/PortfolioRisk.h>
#include <quant/fixed_income/YieldCurve.h>

//
//Macaulay = WHEN
//
//Modified = HOW SENSITIVE
//
//DV01 = HOW MUCH MONEY PER 1bp
//
//Convexity = HOW MUCH THE SENSITIVITY ITSELF CHANGES
int main()
{
    using namespace quant;
    using namespace quant::pricing;

    EuropeanOption option(
        OptionType::Call,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    constexpr double marketPrice = 10.4506;

    const double impliedVolatility =
        ImpliedVolatility::calculate(
            option,
            marketPrice);

    std::cout
        << std::fixed
        << std::setprecision(4);

    std::cout
        << "Price: "
        << BlackScholes::price(option)
        << '\n';

    std::cout
        << "Delta: "
        << BlackScholes::delta(option)
        << '\n';

    std::cout
        << "Gamma: "
        << BlackScholes::gamma(option)
        << '\n';

    std::cout
        << "Vega: "
        << BlackScholes::vega(option)
        << '\n';

    std::cout
        << "Theta: "
        << BlackScholes::theta(option)
        << '\n';

    std::cout
        << "Rho: "
        << BlackScholes::rho(option)
        << '\n';

    std::cout
        << "Implied volatility: "
        << impliedVolatility * 100.0
        << "%\n";

    using quant::fixed_income::Cashflow;
    using quant::fixed_income::Discounting;

    std::vector<Cashflow> cashflows =
    {
        {1.0, 50.0},
        {2.0, 50.0},
        {3.0, 50.0},
        {4.0, 50.0},
        {5.0, 1050.0}
    };

    const double pv =
        Discounting::presentValue(
            cashflows,
            0.05);

    std::cout << '\n';
    std::cout << "Bond cashflows\n";
    std::cout << "--------------\n";
    std::cout << "Present value: " << pv << '\n';

    using quant::fixed_income::Bond;

    const Bond bond(
        1000.0,
        0.05,
        5.0,
        1
    );

    const auto cashflows3 = bond.cashflows();

    std::cout << "\nBond Cashflow Schedule\n";
    std::cout << "----------------------\n";

    for (const auto& cashflow : cashflows3)
    {
        std::cout
            << "Year: " << cashflow.time
            << "  Amount: " << cashflow.amount
            << '\n';
    }


    const Bond bond2(
        1000.0,
        0.05,
        5.0,
        2
    );

    const auto cashflows2 = bond2.cashflows();

    std::cout << "\nBond Cashflow Schedule second\n";
    std::cout << "----------------------\n";

    for (const auto& cashflow : cashflows2)
    {
        std::cout
            << "Year: " << cashflow.time
            << "  Amount: " << cashflow.amount
            << '\n';
    }

    using quant::fixed_income::YieldToMaturity;

    const Bond ytmBond(
        1000.0,
        0.05,
        5.0,
        1
    );

    const double ytm =
        YieldToMaturity::calculate(
            ytmBond,
            1000.0);

    std::cout
        << "\nYield to maturity: "
        << ytm * 100.0
        << "%\n";

    const double ytm2 =
        YieldToMaturity::calculate(
            ytmBond,
            950.0);

    std::cout
        << "\nYield to maturity 2: "
        << ytm2 * 100.0
        << "%\n";

    const double ytm3 =
        YieldToMaturity::calculate(
            ytmBond,
            1050.0);

    std::cout
        << "\nYield to maturity 3: "
        << ytm3 * 100.0
        << "%\n";



    using quant::fixed_income::Duration;

    const Bond durationBond(
        1000.0,
        0.05,
        5.0,
        1
    );

    const double yield = 0.05;

    const double macaulayDuration =
        Duration::macaulay(
            durationBond,
            yield);

    const double modifiedDuration =
        Duration::modified(
            durationBond,
            yield);

    std::cout
        << "\nMacaulay duration: "
        << macaulayDuration
        << " years\n";

    std::cout
        << "Modified duration: "
        << modifiedDuration
        << '\n';

    using quant::fixed_income::DV01;

    const double dv01 =
        DV01::calculate(
            durationBond,
            yield);

    std::cout
        << "DV01: "
        << dv01
        << '\n';

    using quant::fixed_income::Convexity;

    const double convexity =
        Convexity::calculate(
            durationBond,
            yield);

    std::cout
        << "Convexity: "
        << convexity
        << '\n';

    using quant::fixed_income::RateScenarioEngine;

    const std::vector<double> shocks =
    {
        -100.0,
        -50.0,
        -10.0,
        10.0,
        50.0,
        100.0
    };

    const auto scenarios =
        RateScenarioEngine::runMany(
            durationBond,
            yield,
            shocks);

    std::cout
        << "\nRate Scenarios\n";

    std::cout
        << "-------------------------------------------------------------\n";

    std::cout
        << "Shock(bp)"
        << "\tYield"
        << "\tPrice"
        << "\tExact P&L"
        << "\tDuration"
        << "\tDur+Conv\n";

    for (const auto& scenario : scenarios)
    {
        std::cout
            << scenario.shockBasisPoints
            << "\t\t"
            << scenario.shockedYield * 100.0
            << "%\t"
            << scenario.shockedPrice
            << "\t"
            << scenario.exactPnl
            << "\t"
            << scenario.durationPnl
            << "\t"
            << scenario.durationConvexityPnl
            << '\n';
    }


    using quant::fixed_income::BondPosition;
    using quant::fixed_income::FixedIncomePortfolio;
    using quant::fixed_income::PortfolioRisk;

    FixedIncomePortfolio portfolio;

    portfolio.add({
        Bond(
            1000.0,
            0.05,
            5.0,
            1),
        100.0,
        0.05
        });

    portfolio.add({
        Bond(
            1000.0,
            0.04,
            10.0,
            1),
        50.0,
        0.045
        });

    const double portfolioValue =
        PortfolioRisk::marketValue(portfolio);

    const double portfolioDv01 =
        PortfolioRisk::dv01(portfolio);

    const double pnlPlus100bp =
        PortfolioRisk::scenarioPnl(
            portfolio,
            100.0);

    std::cout
        << "\nPortfolio market value: "
        << portfolioValue
        << '\n';

    std::cout
        << "Portfolio DV01: "
        << portfolioDv01
        << '\n';

    std::cout
        << "Portfolio P&L at +100bp: "
        << pnlPlus100bp
        << '\n';

    using quant::fixed_income::YieldCurve;
    using quant::fixed_income::YieldCurvePoint;

    const YieldCurve yieldCurve({
        {1.0, 0.0400},
        {2.0, 0.0410},
        {5.0, 0.0440},
        {10.0, 0.0460}
        });

    std::cout << "\nYield Curve\n";
    std::cout << "-----------\n";

    std::cout
        << "3Y interpolated rate: "
        << yieldCurve.rate(3.0) * 100.0
        << "%\n";

    std::cout
        << "3Y discount factor: "
        << yieldCurve.discountFactor(3.0)
        << '\n';

    const YieldCurve shiftedCurve =
        yieldCurve.parallelShift(100.0);

    std::cout
        << "3Y rate after +100bp: "
        << shiftedCurve.rate(3.0) * 100.0
        << "%\n";
}