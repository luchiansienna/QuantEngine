#include <quant/fixed_income/YieldToMaturity.h>
#include <quant/fixed_income/Discounting.h>

#include <cmath>
#include <stdexcept>

namespace quant::fixed_income
{
    double YieldToMaturity::calculate(
        const Bond& bond,
        double marketPrice,
        double lowerBound,
        double upperBound,
        double tolerance,
        int maxIterations)
    {
        const auto cashflows = bond.cashflows();

        for (int i = 0; i < maxIterations; ++i)
        {
            const double yield =
                (lowerBound + upperBound) / 2.0;

            const double modelPrice =
                Discounting::presentValue(
                    cashflows,
                    yield);

            const double difference =
                modelPrice - marketPrice;

            if (std::abs(difference) < tolerance)
            {
                return yield;
            }

            if (modelPrice > marketPrice)
            {
                lowerBound = yield;
            }
            else
            {
                upperBound = yield;
            }
        }

        throw std::runtime_error(
            "Yield to maturity did not converge.");
    }
}