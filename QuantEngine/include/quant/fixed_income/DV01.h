#pragma once

#include <quant/fixed_income/Bond.h>

namespace quant::fixed_income
{
    class DV01
    {
    public:
        static double calculate(
            const Bond& bond,
            double yield);
    };
}