#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <quant/instruments/EuropeanOption.h>
#include <quant/pricing/BlackScholes.h>
#include <quant/pricing/ImpliedVolatility.h>

#include <cmath>

TEST_CASE("Black-Scholes call price is correct")
{
    quant::EuropeanOption option(
        quant::OptionType::Call,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    const double price =
        quant::pricing::BlackScholes::price(option);

    REQUIRE(price == Catch::Approx(10.4506).margin(0.0001));
}

TEST_CASE("Black-Scholes put price is correct")
{
    quant::EuropeanOption option(
        quant::OptionType::Put,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    const double price =
        quant::pricing::BlackScholes::price(option);

    REQUIRE(price == Catch::Approx(5.5735).margin(0.0001));
}

TEST_CASE("Call delta is correct")
{
    quant::EuropeanOption option(
        quant::OptionType::Call,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    const double delta =
        quant::pricing::BlackScholes::delta(option);

    REQUIRE(delta == Catch::Approx(0.6368).margin(0.0001));
}

TEST_CASE("Gamma is correct")
{
    quant::EuropeanOption option(
        quant::OptionType::Call,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    const double gamma =
        quant::pricing::BlackScholes::gamma(option);

    REQUIRE(gamma == Catch::Approx(0.0188).margin(0.0001));
}

TEST_CASE("Implied volatility recovers input volatility")
{
    quant::EuropeanOption option(
        quant::OptionType::Call,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    const double marketPrice =
        quant::pricing::BlackScholes::price(option);

    const double impliedVol =
        quant::pricing::ImpliedVolatility::calculate(
            option,
            marketPrice
        );

    REQUIRE(impliedVol == Catch::Approx(0.20).margin(1e-6));
}

TEST_CASE("Put-call parity holds")
{
    quant::EuropeanOption call(
        quant::OptionType::Call,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    quant::EuropeanOption put(
        quant::OptionType::Put,
        100.0,
        100.0,
        0.05,
        0.20,
        1.0
    );

    const double callPrice =
        quant::pricing::BlackScholes::price(call);

    const double putPrice =
        quant::pricing::BlackScholes::price(put);

    const double rhs =
        100.0 -
        100.0 * std::exp(-0.05);

    REQUIRE(
        callPrice - putPrice
        == Catch::Approx(rhs).margin(1e-10)
    );
}