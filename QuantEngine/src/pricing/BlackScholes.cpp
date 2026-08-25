#include <quant/pricing/BlackScholes.h>

#include <cmath>
#include <numbers>

namespace quant::pricing
{
    double BlackScholes::normalCDF(double x)
    {
        return 0.5 * std::erfc(
            -x / std::sqrt(2.0));
    }

    double BlackScholes::normalPDF(double x)
    {
        return std::exp(-0.5 * x * x)
            / std::sqrt(
                2.0 * std::numbers::pi);
    }

    double BlackScholes::d1(
        const EuropeanOption& option)
    {
        const double S = option.getSpot();
        const double K = option.getStrike();
        const double r = option.getRiskFreeRate();
        const double sigma = option.getVolatility();
        const double T = option.getTimeToExpiry();

        return (
            std::log(S / K)
            + (r + 0.5 * sigma * sigma) * T
            ) / (
                sigma * std::sqrt(T)
                );
    }

    double BlackScholes::d2(
        const EuropeanOption& option)
    {
        return d1(option)
            - option.getVolatility()
            * std::sqrt(option.getTimeToExpiry());
    }

    double BlackScholes::price(
        const EuropeanOption& option)
    {
        const double S = option.getSpot();
        const double K = option.getStrike();
        const double r = option.getRiskFreeRate();
        const double T = option.getTimeToExpiry();

        const double d1Value = d1(option);
        const double d2Value = d2(option);

        if (option.getType() == OptionType::Call)
        {
            return
                S * normalCDF(d1Value)
                - K * std::exp(-r * T)
                * normalCDF(d2Value);
        }

        return
            K * std::exp(-r * T)
            * normalCDF(-d2Value)
            - S * normalCDF(-d1Value);
    }

    double BlackScholes::delta(
        const EuropeanOption& option)
    {
        const double d1Value = d1(option);

        if (option.getType() == OptionType::Call)
            return normalCDF(d1Value);

        return normalCDF(d1Value) - 1.0;
    }

    double BlackScholes::gamma(
        const EuropeanOption& option)
    {
        const double S = option.getSpot();
        const double sigma = option.getVolatility();
        const double T = option.getTimeToExpiry();

        return normalPDF(d1(option))
            / (S * sigma * std::sqrt(T));
    }

    double BlackScholes::vega(
        const EuropeanOption& option)
    {
        const double S = option.getSpot();
        const double T = option.getTimeToExpiry();

        return S
            * normalPDF(d1(option))
            * std::sqrt(T);
    }

    double BlackScholes::theta(
        const EuropeanOption& option)
    {
        const double S = option.getSpot();
        const double K = option.getStrike();
        const double r = option.getRiskFreeRate();
        const double sigma = option.getVolatility();
        const double T = option.getTimeToExpiry();

        const double d1Value = d1(option);
        const double d2Value = d2(option);

        const double firstTerm =
            -(S * normalPDF(d1Value) * sigma)
            / (2.0 * std::sqrt(T));

        if (option.getType() == OptionType::Call)
        {
            return firstTerm
                - r * K
                * std::exp(-r * T)
                * normalCDF(d2Value);
        }

        return firstTerm
            + r * K
            * std::exp(-r * T)
            * normalCDF(-d2Value);
    }

    double BlackScholes::rho(
        const EuropeanOption& option)
    {
        const double K = option.getStrike();
        const double r = option.getRiskFreeRate();
        const double T = option.getTimeToExpiry();

        const double d2Value = d2(option);

        if (option.getType() == OptionType::Call)
        {
            return K
                * T
                * std::exp(-r * T)
                * normalCDF(d2Value);
        }

        return -K
            * T
            * std::exp(-r * T)
            * normalCDF(-d2Value);
    }
}