#include <quant/fixed_income/Discounting.h>

#include <cmath>

namespace quant::fixed_income
{
    double Discounting::presentValue(
        const std::vector<Cashflow>& cashflows,
        double annualRate)
    {
        double pv = 0.0;

        for (const auto& cashflow : cashflows)
        {
            pv += cashflow.amount
                / std::pow(
                    1.0 + annualRate,
                    cashflow.time);
        }

        return pv;
    }
}