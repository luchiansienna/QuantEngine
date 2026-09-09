#include <quant/fixed_income/Bond.h>
#include <quant/fixed_income/Convexity.h>
#include <quant/fixed_income/DV01.h>
#include <quant/fixed_income/Discounting.h>
#include <quant/fixed_income/Duration.h>
#include <quant/fixed_income/RateScenarioEngine.h>

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
        std::vector<double> shocksBasisPoints{ -100.0, -50.0, -25.0, 0.0, 25.0, 50.0, 100.0 };
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
                args.shocksBasisPoints.push_back(parseDouble(argv[index], "shockBasisPoints"));
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
        const double price = Discounting::presentValue(cashflows, args.yield);
        const double macaulayDuration = Duration::macaulay(bond, args.yield);
        const double modifiedDuration = Duration::modified(bond, args.yield);
        const double dv01 = DV01::calculate(bond, args.yield);
        const double convexity = Convexity::calculate(bond, args.yield);
        const auto scenarios = RateScenarioEngine::runMany(
            bond,
            args.yield,
            args.shocksBasisPoints);

        std::cout << std::setprecision(15)
            << "{\"instrument\":{"
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
                << ",\"amount\":" << cashflows[index].amount << '}';
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
                std::vector<std::string> tokens{ "QuantCli" };
                std::string token;
                while (stream >> token) tokens.push_back(token);
                std::vector<char*> pointers;
                for (auto& text : tokens) pointers.push_back(text.data());
                writeJson(parseArguments(static_cast<int>(pointers.size()), pointers.data()));
                std::cout << std::endl;
            }
            catch (const std::exception& exception)
            {
                std::cerr << exception.what() << std::endl;
                // Constant JSON avoids unescaped exception text on the protocol stream.
                std::cout << "{\"error\":\"Invalid bond inputs; check coupon periods and yield bounds (-50% to 100%).\"}" << std::endl;
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