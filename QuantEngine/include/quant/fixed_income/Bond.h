#pragma once

#include <vector>

#include <quant/fixed_income/Cashflow.h>

namespace quant::fixed_income
{
    class Bond
    {
    public:
        Bond(
            double faceValue,
            double couponRate,
            double maturityYears,
            int paymentsPerYear);

        double getFaceValue() const;
        double getCouponRate() const;
        double getMaturityYears() const;
        int getPaymentsPerYear() const;

        std::vector<Cashflow> cashflows() const;

    private:
        double faceValue_;
        double couponRate_;
        double maturityYears_;
        int paymentsPerYear_;
    };
}