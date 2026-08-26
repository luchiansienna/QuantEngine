#pragma once

#include <quant/fixed_income/Bond.h>

namespace quant::fixed_income
{
    class Duration
    {
    public:
        static double macaulay(
            const Bond& bond,
            double yield);

        static double modified(
            const Bond& bond,
            double yield);
    };
}