#include <iostream>
#include <iomanip>

#include <quant/instruments/EuropeanOption.h>
#include <quant/pricing/BlackScholes.h>
#include <quant/pricing/ImpliedVolatility.h>
#include <vector>

#include <quant/fixed_income/Cashflow.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/Bond.h>

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
}