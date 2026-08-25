#pragma once

#include <vector>

#include <quant/fixed_income/Cashflow.h>

namespace quant::fixed_income
{
    class Discounting
    {
    public:
        static double presentValue(
            const std::vector<Cashflow>& cashflows,
            double annualRate);
    };
}