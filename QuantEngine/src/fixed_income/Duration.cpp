#include <quant/fixed_income/Duration.h>
#include <quant/fixed_income/Discounting.h>

#include <cmath>
#include <stdexcept>

namespace quant::fixed_income
{
    double Duration::macaulay(
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

        double weightedPresentValue = 0.0;

        for (const auto& cashflow : cashflows)
        {
            const double presentValue =
                cashflow.amount
                / std::pow(
                    1.0 + yield,
                    cashflow.time);

            weightedPresentValue +=
                cashflow.time * presentValue;
        }

        return weightedPresentValue / price;
    }

    double Duration::modified(
        const Bond& bond,
        double yield)
    {
        const double macaulayDuration =
            macaulay(bond, yield);

        return macaulayDuration
            / (1.0 + yield);
    }
}