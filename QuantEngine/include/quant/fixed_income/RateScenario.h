#pragma once

namespace quant::fixed_income
{
    struct RateScenarioResult
    {
        double shockBasisPoints;
        double shockedYield;

        double originalPrice;
        double shockedPrice;

        double exactPnl;
        double durationPnl;
        double durationConvexityPnl;
    };
}