#pragma once

#include <quant/fixed_income/FixedIncomePortfolio.h>

namespace quant::fixed_income
{
    class PortfolioRisk
    {
    public:
        static double marketValue(
            const FixedIncomePortfolio& portfolio);

        static double dv01(
            const FixedIncomePortfolio& portfolio);

        static double scenarioPnl(
            const FixedIncomePortfolio& portfolio,
            double shockBasisPoints);
    };
}