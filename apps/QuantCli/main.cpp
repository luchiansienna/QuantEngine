#include "RiskCommands.h"
#include <quant/fixed_income/Bond.h>
#include <quant/fixed_income/YieldCurve.h>
#include <quant/fixed_income/Convexity.h>
#include <quant/fixed_income/DV01.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/Duration.h>
#include <quant/fixed_income/RateScenarioEngine.h>
#include <quant/instruments/EuropeanOption.h>
#include <quant/pricing/BlackScholes.h>
#include <quant/pricing/ImpliedVolatility.h>

#include <algorithm>
#include <cstdlib>
#include <cmath>
#include <sstream>
#include <exception>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace
{
    struct Arguments
    {
        double faceValue = 1000.0;
        double couponRate = 0.05;
        double maturityYears = 5.0;
        int paymentsPerYear = 2;
        double yield = 0.045;
        std::vector<quant::fixed_income::YieldCurvePoint> curve;
        std::vector<double> shocksBasisPoints{ -100.0, -50.0, -25.0, 0.0, 25.0, 50.0, 100.0 };
    };

    struct OptionArguments
    {
        quant::OptionType type = quant::OptionType::Call;
        double spot = 100.0;
        double strike = 100.0;
        double riskFreeRate = 0.05;
        double volatility = 0.20;
        double timeToExpiry = 1.0;
        double marketPrice = 10.4506;
    };

    double parseDouble(const char* value, const std::string& name)
    {
        char* end = nullptr;
        const double result = std::strtod(value, &end);
        if (end == value || *end != '\0' || !std::isfinite(result))
            throw std::invalid_argument("Invalid value for " + name + ".");
        return result;
    }

    Arguments parseArguments(int argc, char* argv[])
    {
        if (argc < 6)
        {
            throw std::invalid_argument(
                "Usage: QuantCli <faceValue> <couponRate> <maturityYears> "
                "<paymentsPerYear> <yield> [shockBasisPoints ...]");
        }

        Arguments args;
        args.faceValue = parseDouble(argv[1], "faceValue");
        args.couponRate = parseDouble(argv[2], "couponRate");
        args.maturityYears = parseDouble(argv[3], "maturityYears");
        const auto frequency = parseDouble(argv[4], "paymentsPerYear");
        if (frequency != 1 && frequency != 2 && frequency != 4 && frequency != 12)
            throw std::invalid_argument("Unsupported payment frequency.");
        args.paymentsPerYear = static_cast<int>(frequency);
        args.yield = parseDouble(argv[5], "yield");

        if (argc > 6)
        {
            args.shocksBasisPoints.clear();
            for (int index = 6; index < argc; ++index)
            {
                if (std::string(argv[index]) == "--curve")
                {
                    if ((argc - index - 1) < 4 || (argc - index - 1) % 2 != 0)
                        throw std::invalid_argument("Supply at least two maturity/rate pairs.");
                    for (++index; index < argc; index += 2)
                        args.curve.push_back({parseDouble(argv[index], "tenor"), parseDouble(argv[index + 1], "zeroRate")});
                    break;
                }
                args.shocksBasisPoints.push_back(parseDouble(argv[index], "shockBasisPoints"));
            }
        }

        if (args.faceValue <= 0 || args.faceValue > 1e12 ||
            args.couponRate < 0 || args.couponRate > 1 ||
            args.maturityYears <= 0 || args.maturityYears > 100 ||
            args.yield < -0.5 || args.yield > 1 ||
            args.shocksBasisPoints.size() > 25)
            throw std::invalid_argument("Inputs outside supported bounds.");
        const double payments = args.maturityYears * args.paymentsPerYear;
        if (payments < 1 || std::abs(payments - std::round(payments)) > 1e-8)
            throw std::invalid_argument("Maturity must contain a whole number of coupon periods.");
        for (double shock : args.shocksBasisPoints)
            if (args.yield + shock * 0.0001 < -0.5 ||
                args.yield + shock * 0.0001 > 1)
                throw std::invalid_argument("Shocked yield outside supported bounds.");
        if (args.shocksBasisPoints.empty() || args.curve.size() > 30)
            throw std::invalid_argument("Invalid scenario or curve count.");
        for (const auto& point : args.curve)
        {
            if (point.maturityYears <= 0 || point.maturityYears > 100 || point.rate < -0.5 || point.rate > 1)
                throw std::invalid_argument("Curve point outside bounds.");
            for (double shock : args.shocksBasisPoints)
                if (point.rate + shock * .0001 < -0.5 || point.rate + shock * .0001 > 1)
                    throw std::invalid_argument("Shifted curve outside bounds.");
        }
        return args;
    }

    OptionArguments parseOptionArguments(const std::vector<std::string>& tokens)
    {
        if (tokens.size() != 7)
            throw std::invalid_argument("Option requires type, spot, strike, rate, volatility, expiry and market price.");

        OptionArguments args;
        if (tokens[0] == "call") args.type = quant::OptionType::Call;
        else if (tokens[0] == "put") args.type = quant::OptionType::Put;
        else throw std::invalid_argument("Option type must be call or put.");

        args.spot = parseDouble(tokens[1].c_str(), "spot");
        args.strike = parseDouble(tokens[2].c_str(), "strike");
        args.riskFreeRate = parseDouble(tokens[3].c_str(), "riskFreeRate");
        args.volatility = parseDouble(tokens[4].c_str(), "volatility");
        args.timeToExpiry = parseDouble(tokens[5].c_str(), "timeToExpiry");
        args.marketPrice = parseDouble(tokens[6].c_str(), "marketPrice");

        if (args.spot <= 0 || args.spot > 1e9 || args.strike <= 0 || args.strike > 1e9 ||
            args.riskFreeRate < -0.5 || args.riskFreeRate > 1 ||
            args.volatility <= 0 || args.volatility > 5 ||
            args.timeToExpiry <= 0 || args.timeToExpiry > 100 || args.marketPrice <= 0)
            throw std::invalid_argument("Option inputs outside supported bounds.");

        const double discountedStrike = args.strike * std::exp(-args.riskFreeRate * args.timeToExpiry);
        const double lower = args.type == quant::OptionType::Call
            ? std::max(0.0, args.spot - discountedStrike)
            : std::max(0.0, discountedStrike - args.spot);
        const double upper = args.type == quant::OptionType::Call ? args.spot : discountedStrike;
        if (args.marketPrice <= lower || args.marketPrice >= upper)
            throw std::invalid_argument("Market price violates option no-arbitrage bounds.");
        return args;
    }

    void writeJson(const Arguments& args)
    {
        using namespace quant::fixed_income;

        const Bond bond(
            args.faceValue,
            args.couponRate,
            args.maturityYears,
            args.paymentsPerYear);

        const auto cashflows = bond.cashflows();
        double price = Discounting::presentValue(cashflows, args.yield);
        double macaulayDuration = Duration::macaulay(bond, args.yield);
        double modifiedDuration = Duration::modified(bond, args.yield);
        double dv01 = DV01::calculate(bond, args.yield);
        double convexity = Convexity::calculate(bond, args.yield);
        auto scenarios = RateScenarioEngine::runMany(
            bond,
            args.yield,
            args.shocksBasisPoints);

        // Derivatives with respect to an additive shift of ALL annual zero rates.
        if (!args.curve.empty())
        {
            const YieldCurve curve(args.curve);
            price = 0; macaulayDuration = 0; modifiedDuration = 0; convexity = 0;
            for (const auto& cf : cashflows)
            {
                const double pv = cf.amount * curve.discountFactor(cf.time);
                const double base = 1 + curve.rate(cf.time);
                price += pv;
                macaulayDuration += cf.time * pv;
                modifiedDuration += cf.time * pv / base;
                convexity += cf.time * (cf.time + 1) * pv / (base * base);
            }
            macaulayDuration /= price; modifiedDuration /= price; convexity /= price;
            dv01 = price * modifiedDuration * .0001;
            scenarios.clear();
            for (double shock : args.shocksBasisPoints)
            {
                const auto shifted = curve.parallelShift(shock);
                double shockedPrice = 0;
                for (const auto& cf : cashflows)
                    shockedPrice += cf.amount * shifted.discountFactor(cf.time);
                const double dy = shock * .0001;
                const double linear = -price * modifiedDuration * dy;
                scenarios.push_back({shock, shifted.rate(args.maturityYears), price, shockedPrice,
                    shockedPrice - price, linear, linear + .5 * price * convexity * dy * dy});
            }
        }

        std::cout << std::setprecision(15)
                  << "{\"valuationMode\":\"" << (args.curve.empty() ? "flat" : "curve") << "\",\"instrument\":{"
                  << "\"type\":\"FixedRateBond\","
                  << "\"faceValue\":" << args.faceValue << ','
                  << "\"couponRate\":" << args.couponRate << ','
                  << "\"maturityYears\":" << args.maturityYears << ','
                  << "\"paymentsPerYear\":" << args.paymentsPerYear << ','
                  << "\"yield\":" << args.yield
                  << "},\"metrics\":{"
                  << "\"presentValue\":" << price << ','
                  << "\"macaulayDuration\":" << macaulayDuration << ','
                  << "\"modifiedDuration\":" << modifiedDuration << ','
                  << "\"dv01\":" << dv01 << ','
                  << "\"convexity\":" << convexity
                  << "},\"cashflows\":[";

        for (std::size_t index = 0; index < cashflows.size(); ++index)
        {
            if (index > 0) std::cout << ',';
            std::cout << "{\"timeYears\":" << cashflows[index].time
                      << ",\"amount\":" << cashflows[index].amount;
            const double rate = args.curve.empty() ? args.yield : YieldCurve(args.curve).rate(cashflows[index].time);
            const double df = std::pow(1 + rate, -cashflows[index].time);
            std::cout << ",\"zeroRate\":" << rate << ",\"discountFactor\":" << df
                      << ",\"presentValue\":" << cashflows[index].amount * df << '}';
        }

        std::cout << "],\"scenarios\":[";
        for (std::size_t index = 0; index < scenarios.size(); ++index)
        {
            if (index > 0) std::cout << ',';
            const auto& scenario = scenarios[index];
            std::cout << "{\"shockBasisPoints\":" << scenario.shockBasisPoints
                      << ",\"shockedYield\":" << scenario.shockedYield
                      << ",\"originalPrice\":" << scenario.originalPrice
                      << ",\"shockedPrice\":" << scenario.shockedPrice
                      << ",\"exactPnl\":" << scenario.exactPnl
                      << ",\"durationPnl\":" << scenario.durationPnl
                      << ",\"durationConvexityPnl\":" << scenario.durationConvexityPnl
                      << '}';
        }
        std::cout << "],\"curvePoints\":[";
        if (!args.curve.empty())
        {
            const YieldCurve curve(args.curve);
            for (std::size_t i = 0; i < curve.points().size(); ++i)
            {
                if (i) std::cout << ',';
                const auto& point = curve.points()[i];
                std::cout << "{\"maturityYears\":" << point.maturityYears << ",\"rate\":" << point.rate << '}';
            }
        }
        std::cout << "]}";
    }

    void writeOptionJson(const OptionArguments& args)
    {
        using quant::EuropeanOption;
        using quant::pricing::BlackScholes;
        using quant::pricing::ImpliedVolatility;

        const EuropeanOption option(args.type, args.spot, args.strike, args.riskFreeRate,
            args.volatility, args.timeToExpiry);
        const double modelPrice = BlackScholes::price(option);

        std::cout << std::setprecision(15)
            << "{\"instrument\":{\"type\":\"EuropeanOption\",\"optionType\":\""
            << (args.type == quant::OptionType::Call ? "Call" : "Put") << "\","
            << "\"spot\":" << args.spot << ",\"strike\":" << args.strike
            << ",\"riskFreeRate\":" << args.riskFreeRate << ",\"volatility\":" << args.volatility
            << ",\"timeToExpiry\":" << args.timeToExpiry << ",\"marketPrice\":" << args.marketPrice
            << "},\"metrics\":{\"modelPrice\":" << modelPrice
            << ",\"intrinsicValue\":" << (args.type == quant::OptionType::Call
                ? std::max(args.spot - args.strike, 0.0) : std::max(args.strike - args.spot, 0.0))
            << ",\"impliedVolatility\":" << ImpliedVolatility::calculate(option, args.marketPrice)
            << ",\"delta\":" << BlackScholes::delta(option)
            << ",\"gamma\":" << BlackScholes::gamma(option)
            << ",\"vegaPerPercentagePoint\":" << BlackScholes::vega(option) / 100.0
            << ",\"thetaPerDay\":" << BlackScholes::theta(option) / 365.0
            << ",\"rhoPerPercentagePoint\":" << BlackScholes::rho(option) / 100.0
            << "},\"spotScenarios\":[";

        const double spotMultipliers[]{.70, .80, .90, 1.00, 1.10, 1.20, 1.30};
        for (std::size_t index = 0; index < std::size(spotMultipliers); ++index)
        {
            if (index) std::cout << ',';
            const double spot = args.spot * spotMultipliers[index];
            const EuropeanOption scenario(args.type, spot, args.strike, args.riskFreeRate,
                args.volatility, args.timeToExpiry);
            const double payoff = args.type == quant::OptionType::Call
                ? std::max(spot - args.strike, 0.0) : std::max(args.strike - spot, 0.0);
            std::cout << "{\"spot\":" << spot << ",\"modelPrice\":" << BlackScholes::price(scenario)
                << ",\"payoffAtExpiry\":" << payoff << '}';
        }

        std::cout << "],\"volatilityScenarios\":[";
        const double volatilityShifts[]{-.10, -.05, 0.0, .05, .10};
        for (std::size_t index = 0; index < std::size(volatilityShifts); ++index)
        {
            if (index) std::cout << ',';
            const double volatility = std::max(.0001, args.volatility + volatilityShifts[index]);
            const double scenarioPrice = BlackScholes::price(option.withVolatility(volatility));
            std::cout << "{\"volatility\":" << volatility << ",\"modelPrice\":" << scenarioPrice
                << ",\"pnl\":" << scenarioPrice - modelPrice << '}';
        }
        std::cout << "]}";
    }
}

int main(int argc, char* argv[])
{
    if (argc == 2 && std::string(argv[1]) == "--server")
    {
        // One whitespace-separated numeric request per line; one JSON response per line.
        std::string line;
        while (std::getline(std::cin, line))
        {
            try
            {
                std::istringstream stream(line);
                std::vector<std::string> tokens;
                std::string token;
                while (stream >> token) tokens.push_back(token);
                if (tokens.empty()) throw std::invalid_argument("Empty request.");

                if (tokens.front() == "risk" || tokens.front() == "credit-bond" || tokens.front() == "historical-var")
                {
                    writeRiskCommand(tokens, std::cout);
                }
                else if (tokens.front() == "option")
                {
                    tokens.erase(tokens.begin());
                    writeOptionJson(parseOptionArguments(tokens));
                }
                else
                {
                    if (tokens.front() == "bond") tokens.erase(tokens.begin());
                    tokens.insert(tokens.begin(), "QuantCli");
                    std::vector<char*> pointers;
                    for (auto& text : tokens) pointers.push_back(text.data());
                    writeJson(parseArguments(static_cast<int>(pointers.size()), pointers.data()));
                }
                std::cout << std::endl;
            }
            catch (const std::exception& exception)
            {
                std::cerr << exception.what() << std::endl;
                // Constant JSON avoids unescaped exception text on the protocol stream.
                std::cout << "{\"error\":\"Native engine rejected the pricing inputs.\"}" << std::endl;
            }
        }
        return 0;
    }
    try
    {
        const auto args = parseArguments(argc, argv);
        writeJson(args);
        return 0;
    }
    catch (const std::exception& exception)
    {
        std::cerr << exception.what() << '\n';
        return 1;
    }
}
