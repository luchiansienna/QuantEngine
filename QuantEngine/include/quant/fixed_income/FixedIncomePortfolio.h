#pragma once

#include <vector>

#include <quant/fixed_income/BondPosition.h>

namespace quant::fixed_income
{
    class FixedIncomePortfolio
    {
    public:
        void add(const BondPosition& position);

        const std::vector<BondPosition>& positions() const;

    private:
        std::vector<BondPosition> positions_;
    };
}