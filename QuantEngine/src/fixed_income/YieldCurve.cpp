#include <quant/fixed_income/YieldCurve.h>

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <utility>

namespace quant::fixed_income
{
    YieldCurve::YieldCurve(
        std::vector<YieldCurvePoint> points)
        : points_(std::move(points))
    {
        if (points_.empty())
        {
            throw std::invalid_argument(
                "Yield curve must contain at least one point.");
        }

        std::sort(
            points_.begin(),
            points_.end(),
            [](const YieldCurvePoint& left,
                const YieldCurvePoint& right)
            {
                return left.maturityYears < right.maturityYears;
            });

        for (std::size_t index = 0; index < points_.size(); ++index)
        {
            const YieldCurvePoint& point = points_[index];

            if (point.maturityYears <= 0.0)
            {
                throw std::invalid_argument(
                    "Yield curve maturities must be positive.");
            }

            if (point.rate <= -1.0)
            {
                throw std::invalid_argument(
                    "Yield curve rates must be greater than -100%.");
            }

            if (index > 0 &&
                point.maturityYears ==
                points_[index - 1].maturityYears)
            {
                throw std::invalid_argument(
                    "Yield curve maturities must be unique.");
            }
        }
    }

    double YieldCurve::rate(
        const double maturityYears) const
    {
        if (maturityYears < 0.0)
        {
            throw std::invalid_argument(
                "Maturity cannot be negative.");
        }

        // Flat extrapolation before the first curve point.
        if (maturityYears <= points_.front().maturityYears)
        {
            return points_.front().rate;
        }

        // Flat extrapolation after the last curve point.
        if (maturityYears >= points_.back().maturityYears)
        {
            return points_.back().rate;
        }

        const auto upper = std::lower_bound(
            points_.begin(),
            points_.end(),
            maturityYears,
            [](const YieldCurvePoint& point,
                const double maturity)
            {
                return point.maturityYears < maturity;
            });

        const auto lower = upper - 1;

        const double interval =
            upper->maturityYears - lower->maturityYears;

        const double weight =
            (maturityYears - lower->maturityYears) / interval;

        return lower->rate +
            weight * (upper->rate - lower->rate);
    }

    double YieldCurve::discountFactor(
        const double maturityYears) const
    {
        if (maturityYears < 0.0)
        {
            throw std::invalid_argument(
                "Maturity cannot be negative.");
        }

        if (maturityYears == 0.0)
        {
            return 1.0;
        }

        const double zeroRate = rate(maturityYears);

        return 1.0 /
            std::pow(1.0 + zeroRate, maturityYears);
    }

    YieldCurve YieldCurve::parallelShift(
        const double basisPoints) const
    {
        constexpr double basisPoint = 0.0001;
        const double rateShift = basisPoints * basisPoint;

        std::vector<YieldCurvePoint> shiftedPoints;
        shiftedPoints.reserve(points_.size());

        for (const YieldCurvePoint& point : points_)
        {
            shiftedPoints.push_back(
                YieldCurvePoint{
                    point.maturityYears,
                    point.rate + rateShift
                });
        }

        return YieldCurve(std::move(shiftedPoints));
    }

    const std::vector<YieldCurvePoint>&
        YieldCurve::points() const
    {
        return points_;
    }
}