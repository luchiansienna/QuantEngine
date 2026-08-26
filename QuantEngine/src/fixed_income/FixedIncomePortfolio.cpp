#include <quant/fixed_income/FixedIncomePortfolio.h>

namespace quant::fixed_income
{
    void FixedIncomePortfolio::add(
        const BondPosition& position)
    {
        positions_.push_back(position);
    }

    const std::vector<BondPosition>&
        FixedIncomePortfolio::positions() const
    {
        return positions_;
    }
}