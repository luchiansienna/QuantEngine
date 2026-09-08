#pragma once

namespace quant::fixed_income
{
    struct YieldCurvePoint
    {
        double maturityYears;
        double rate;
    };
}