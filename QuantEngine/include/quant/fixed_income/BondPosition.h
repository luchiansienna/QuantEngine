#pragma once

#include <quant/fixed_income/Bond.h>

namespace quant::fixed_income
{
    struct BondPosition
    {
        Bond bond;
        double quantity;
        double marketYield;
    };
}