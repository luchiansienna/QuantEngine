#pragma once
#include <quant/risk/RiskAnalytics.h>
#include <cmath>
#include <iomanip>
#include <ostream>
#include <stdexcept>
#include <string>
#include <vector>

inline void writeRiskCommand(const std::vector<std::string>& tokens, std::ostream& out) {
    auto number = [&](std::size_t i) {
        if (i >= tokens.size()) throw std::invalid_argument("Missing risk argument.");
        std::size_t used = 0;
        double x = std::stod(tokens[i], &used);
        if (used != tokens[i].size() || !std::isfinite(x)) throw std::invalid_argument("Invalid risk number.");
        return x;
    };
    auto integer = [&](std::size_t i, double max) {
        double x=number(i);
        if (x < 0 || x > max || x != std::floor(x)) throw std::invalid_argument("Invalid risk integer.");
        return static_cast<unsigned int>(x);
    };
    out << std::setprecision(15);
    if (tokens[0] == "risk") {
        if (tokens.size() < 18 || (tokens.size()-16)%2) throw std::invalid_argument("Invalid forward pairs.");
        quant::risk::SimulationInput x;
        x.spot=number(1); x.rate=number(2); x.dividendYield=number(3); x.volatility=number(4);
        x.maturity=number(5); x.confidence=number(6); x.physicalDrift=number(7);
        x.horizonDays=number(8); x.collateral=number(9); x.hazardRate=number(10); x.recovery=number(11);
        x.paths=integer(12,100000); x.steps=integer(13,120); x.seed=integer(14,4294967295.0);
        const auto count=integer(15,100);
        if (tokens.size() != 16+2*count) throw std::invalid_argument("Trade count mismatch.");
        x.trades.clear();
        for (std::size_t i=16; i<tokens.size(); i+=2) x.trades.push_back({number(i),number(i+1)});
        const auto r = quant::risk::simulate(x);
        out << "{\"cleanValue\":" << r.cleanValue << ",\"cva\":" << r.cva << ",\"adjustedValue\":" << r.adjustedValue
            << ",\"peakPfe\":" << r.peakPfe << ",\"var\":" << r.marketRisk.var << ",\"expectedShortfall\":" << r.marketRisk.expectedShortfall
            << ",\"paths\":" << x.paths << ",\"seed\":" << x.seed << ",\"confidence\":" << x.confidence << ",\"horizonDays\":" << x.horizonDays
            << ",\"modelVersion\":\"equity-forward-gbm-v1\",\"profile\":[";
        for (std::size_t i=0; i<r.profile.size(); ++i) {
            if (i) out << ',';
            const auto& p=r.profile[i];
            out << "{\"time\":" << p.time << ",\"expectedExposure\":" << p.expectedExposure << ",\"pfe\":" << p.pfe << '}';
        }
        out << "]}";
    } else if (tokens[0] == "credit-bond") {
        if (tokens.size()!=8) throw std::invalid_argument("Invalid credit bond arguments.");
        const auto r=quant::risk::priceCreditBond(number(1),number(2),number(3),integer(4,12),number(5),number(6),number(7));
        out << "{\"riskFreePrice\":" << r.riskFreePrice << ",\"riskyPrice\":" << r.riskyPrice << ",\"creditAdjustment\":" << r.creditAdjustment
            << ",\"defaultProbability\":" << r.defaultProbability << '}';
    } else if (tokens[0] == "historical-var") {
        if (tokens.size()<3) throw std::invalid_argument("Missing historical P&L.");
        std::vector<double> losses;
        for (std::size_t i=2; i<tokens.size(); ++i) losses.push_back(-number(i));
        const auto r=quant::risk::lossRisk(losses,number(1));
        out << "{\"var\":" << r.var << ",\"expectedShortfall\":" << r.expectedShortfall << ",\"observations\":" << r.observations << '}';
    } else throw std::invalid_argument("Unknown risk command.");
}
