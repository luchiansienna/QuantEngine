#pragma once

#include <quant/instruments/EuropeanOption.h>

namespace quant::pricing
{
    class BlackScholes
    {
    public:
        static double price(
            const EuropeanOption& option);

        static double delta(
            const EuropeanOption& option);

        static double gamma(
            const EuropeanOption& option);

        static double vega(
            const EuropeanOption& option);

        static double theta(
            const EuropeanOption& option);

        static double rho(
            const EuropeanOption& option);

    private:
        static double normalCDF(double x);
        static double normalPDF(double x);

        static double d1(
            const EuropeanOption& option);

        static double d2(
            const EuropeanOption& option);
    };
}