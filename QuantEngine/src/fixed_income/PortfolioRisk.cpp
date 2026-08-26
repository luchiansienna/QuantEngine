#include <quant/fixed_income/PortfolioRisk.h>

#include <quant/fixed_income/DV01.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/RateScenarioEngine.h>
#include <quant/fixed_income/FixedIncomePortfolio.h>

namespace quant::fixed_income
{
    double PortfolioRisk::marketValue(
        const FixedIncomePortfolio& portfolio)
    {
        double total = 0.0;

        for (const auto& position : portfolio.positions())
        {
            const auto cashflows =
                position.bond.cashflows();

            const double bondPrice =
                Discounting::presentValue(
                    cashflows,
                    position.marketYield);

            total +=
                bondPrice * position.quantity;
        }

        return total;
    }

    double PortfolioRisk::dv01(
        const FixedIncomePortfolio& portfolio)
    {
        double total = 0.0;

        for (const auto& position : portfolio.positions())
        {
            const double positionDv01 =
                DV01::calculate(
                    position.bond,
                    position.marketYield)
                * position.quantity;

            total += positionDv01;
        }

        return total;
    }

    double PortfolioRisk::scenarioPnl(
        const FixedIncomePortfolio& portfolio,
        double shockBasisPoints)
    {
        double totalPnl = 0.0;

        for (const auto& position : portfolio.positions())
        {
            const auto scenario =
                RateScenarioEngine::run(
                    position.bond,
                    position.marketYield,
                    shockBasisPoints);

            totalPnl +=
                scenario.exactPnl
                * position.quantity;
        }

        return totalPnl;
    }
}