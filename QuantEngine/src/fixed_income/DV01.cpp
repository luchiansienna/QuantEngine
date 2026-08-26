#include <quant/fixed_income/DV01.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/Duration.h>

namespace quant::fixed_income
{
    double DV01::calculate(
        const Bond& bond,
        double yield)
    {
        const auto cashflows =
            bond.cashflows();

        const double price =
            Discounting::presentValue(
                cashflows,
                yield);

        const double modifiedDuration =
            Duration::modified(
                bond,
                yield);

        constexpr double oneBasisPoint = 0.0001;

        return price
            * modifiedDuration
            * oneBasisPoint;
    }
}