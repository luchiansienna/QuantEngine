#pragma once

namespace quant
{
    enum class OptionType
    {
        Call,
        Put
    };

    class EuropeanOption
    {
    public:
        EuropeanOption(
            OptionType type,
            double spot,
            double strike,
            double riskFreeRate,
            double volatility,
            double timeToExpiry)
            : type_(type),
            spot_(spot),
            strike_(strike),
            riskFreeRate_(riskFreeRate),
            volatility_(volatility),
            timeToExpiry_(timeToExpiry)
        {
        }

        OptionType getType() const { return type_; }
        double getSpot() const { return spot_; }
        double getStrike() const { return strike_; }
        double getRiskFreeRate() const { return riskFreeRate_; }
        double getVolatility() const { return volatility_; }
        double getTimeToExpiry() const { return timeToExpiry_; }

        EuropeanOption withVolatility(double volatility) const
        {
            return EuropeanOption(
                type_,
                spot_,
                strike_,
                riskFreeRate_,
                volatility,
                timeToExpiry_);
        }

    private:
        OptionType type_;
        double spot_;
        double strike_;
        double riskFreeRate_;
        double volatility_;
        double timeToExpiry_;
    };
}