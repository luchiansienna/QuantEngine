#pragma once

#include <vector>

#include <quant/fixed_income/Bond.h>
#include <quant/fixed_income/RateScenario.h>

namespace quant::fixed_income
{
    class RateScenarioEngine
    {
    public:
        static RateScenarioResult run(
            const Bond& bond,
            double currentYield,
            double shockBasisPoints);

        static std::vector<RateScenarioResult> runMany(
            const Bond& bond,
            double currentYield,
            const std::vector<double>& shocksBasisPoints);
    };
}