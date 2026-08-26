#include <quant/fixed_income/Convexity.h>
#include <quant/fixed_income/Discounting.h>

#include <cmath>
#include <stdexcept>

namespace quant::fixed_income
{
    double Convexity::calculate(
        const Bond& bond,
        double yield)
    {
        if (yield <= -1.0)
        {
            throw std::invalid_argument(
                "Yield must be greater than -100%.");
        }

        const auto cashflows =
            bond.cashflows();

        const double price =
            Discounting::presentValue(
                cashflows,
                yield);

        double weightedConvexity = 0.0;

        for (const auto& cashflow : cashflows)
        {
            const double denominator =
                std::pow(
                    1.0 + yield,
                    cashflow.time + 2.0);

            weightedConvexity +=
                cashflow.amount
                * cashflow.time
                * (cashflow.time + 1.0)
                / denominator;
        }

        return weightedConvexity / price;
    }
}