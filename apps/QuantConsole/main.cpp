#include <iostream>
#include <iomanip>

#include <quant/instruments/EuropeanOption.h>
#include <quant/pricing/BlackScholes.h>
#include <quant/pricing/ImpliedVolatility.h>

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
}