#pragma once

#include <quant/instruments/EuropeanOption.h>

namespace quant::pricing
{
    class ImpliedVolatility
    {
    public:
        static double calculate(
            const EuropeanOption& option,
            double marketPrice,
            double initialGuess = 0.20,
            double tolerance = 1e-6,
            int maxIterations = 100);
    };
}