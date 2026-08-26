#include <quant/fixed_income/RateScenarioEngine.h>

#include <quant/fixed_income/Convexity.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/Duration.h>

namespace quant::fixed_income
{
    RateScenarioResult RateScenarioEngine::run(
        const Bond& bond,
        double currentYield,
        double shockBasisPoints)
    {
        constexpr double basisPoint = 0.0001;

        const double deltaYield =
            shockBasisPoints * basisPoint;

        const double shockedYield =
            currentYield + deltaYield;

        const auto cashflows =
            bond.cashflows();

        const double originalPrice =
            Discounting::presentValue(
                cashflows,
                currentYield);

        const double shockedPrice =
            Discounting::presentValue(
                cashflows,
                shockedYield);

        const double exactPnl =
            shockedPrice - originalPrice;

        const double modifiedDuration =
            Duration::modified(
                bond,
                currentYield);

        const double convexity =
            Convexity::calculate(
                bond,
                currentYield);

        const double durationPercentageChange =
            -modifiedDuration * deltaYield;

        const double durationConvexityPercentageChange =
            -modifiedDuration * deltaYield
            + 0.5
            * convexity
            * deltaYield
            * deltaYield;

        const double durationPnl =
            originalPrice
            * durationPercentageChange;

        const double durationConvexityPnl =
            originalPrice
            * durationConvexityPercentageChange;

        return {
            shockBasisPoints,
            shockedYield,
            originalPrice,
            shockedPrice,
            exactPnl,
            durationPnl,
            durationConvexityPnl
        };
    }

    std::vector<RateScenarioResult>
        RateScenarioEngine::runMany(
            const Bond& bond,
            double currentYield,
            const std::vector<double>& shocksBasisPoints)
    {
        std::vector<RateScenarioResult> results;

        results.reserve(
            shocksBasisPoints.size());

        for (const double shock :
        shocksBasisPoints)
        {
            results.push_back(
                run(
                    bond,
                    currentYield,
                    shock));
        }

        return results;
    }
}