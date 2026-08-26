#pragma once

#include <quant/fixed_income/Bond.h>

namespace quant::fixed_income
{
    class Convexity
    {
    public:
        static double calculate(
            const Bond& bond,
            double yield);
    };
}