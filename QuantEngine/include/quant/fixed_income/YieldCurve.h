#pragma once

#include <vector>

#include <quant/fixed_income/YieldCurvePoint.h>

namespace quant::fixed_income
{
    class YieldCurve
    {
    public:
        explicit YieldCurve(
            std::vector<YieldCurvePoint> points);

        // Zero rate for the requested maturity.
        double rate(double maturityYears) const;

        // Discount factor using annually compounded zero rates:
        // DF(t) = 1 / (1 + r(t))^t
        double discountFactor(double maturityYears) const;

        // Returns a new curve with every rate shifted by basisPoints.
        YieldCurve parallelShift(double basisPoints) const;

        const std::vector<YieldCurvePoint>& points() const;

    private:
        std::vector<YieldCurvePoint> points_;
    };
}