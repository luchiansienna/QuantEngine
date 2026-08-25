#include <quant/pricing/ImpliedVolatility.h>
#include <quant/pricing/BlackScholes.h>

#include <cmath>
#include <stdexcept>

namespace quant::pricing
{
    double ImpliedVolatility::calculate(
        const EuropeanOption& option,
        double marketPrice,
        double initialGuess,
        double tolerance,
        int maxIterations)
    {
        double sigma = initialGuess;

        for (int i = 0; i < maxIterations; ++i)
        {
            const EuropeanOption currentOption =
                option.withVolatility(sigma);

            const double modelPrice =
                BlackScholes::price(currentOption);

            const double difference =
                modelPrice - marketPrice;

            if (std::abs(difference) < tolerance)
                return sigma;

            const double vega =
                BlackScholes::vega(currentOption);

            if (std::abs(vega) < 1e-10)
            {
                throw std::runtime_error(
                    "Cannot calculate implied volatility: "
                    "Vega is too small.");
            }

            sigma -= difference / vega;

            if (sigma <= 0.0)
                sigma = 0.0001;
        }

        throw std::runtime_error(
            "Implied volatility did not converge.");
    }
}