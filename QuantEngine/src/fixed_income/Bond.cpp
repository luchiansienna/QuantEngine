#include <quant/fixed_income/Bond.h>

#include <stdexcept>

namespace quant::fixed_income
{
    Bond::Bond(
        double faceValue,
        double couponRate,
        double maturityYears,
        int paymentsPerYear)
        : faceValue_(faceValue),
        couponRate_(couponRate),
        maturityYears_(maturityYears),
        paymentsPerYear_(paymentsPerYear)
    {
        if (faceValue <= 0.0)
            throw std::invalid_argument(
                "Face value must be positive.");

        if (couponRate < 0.0)
            throw std::invalid_argument(
                "Coupon rate cannot be negative.");

        if (maturityYears <= 0.0)
            throw std::invalid_argument(
                "Maturity must be positive.");

        if (paymentsPerYear <= 0)
            throw std::invalid_argument(
                "Payments per year must be positive.");
    }

    double Bond::getFaceValue() const
    {
        return faceValue_;
    }

    double Bond::getCouponRate() const
    {
        return couponRate_;
    }

    double Bond::getMaturityYears() const
    {
        return maturityYears_;
    }

    int Bond::getPaymentsPerYear() const
    {
        return paymentsPerYear_;
    }

    std::vector<Cashflow> Bond::cashflows() const
    {
        std::vector<Cashflow> result;

        const int numberOfPayments =
            static_cast<int>(
                maturityYears_ * paymentsPerYear_);

        const double couponPayment =
            faceValue_
            * couponRate_
            / paymentsPerYear_;

        for (int payment = 1;
            payment <= numberOfPayments;
            ++payment)
        {
            const double time =
                static_cast<double>(payment)
                / paymentsPerYear_;

            double amount = couponPayment;

            // Principal is returned at maturity.
            if (payment == numberOfPayments)
            {
                amount += faceValue_;
            }

            result.push_back({
                time,
                amount
                });
        }

        return result;
    }
}