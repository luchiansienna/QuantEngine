#pragma once

#include <quant/fixed_income/Bond.h>

namespace quant::fixed_income
{
    class YieldToMaturity
    {
    public:
        static double calculate(
            const Bond& bond,
            double marketPrice,
            double lowerBound = 0.0,
            double upperBound = 1.0,
            double tolerance = 1e-8,
            int maxIterations = 100);
    };
}