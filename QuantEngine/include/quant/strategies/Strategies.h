#pragma once
#include <algorithm>
#include <cmath>
#include <quant/strategies/Strategy.h>

namespace quant::strategies {
class SmaCrossStrategy final : public Strategy {
public:
    SmaCrossStrategy(std::size_t fast, std::size_t slow)
        : fast_(checked(fast, slow)), slow_(slow) {}
    std::size_t warmup() const override { return slow_.size(); }
    bool onClose(const DailyBar& bar, bool) override {
        fast_.push(bar.close); slow_.push(bar.close);
        return slow_.full() && fast_.mean() > slow_.mean();
    }
private:
    static std::size_t checked(std::size_t fast, std::size_t slow) {
        if (!fast || fast >= slow || slow > 2000)
            throw std::invalid_argument("Require 0 < fast < slow <= 2000.");
        return fast;
    }
    RollingWindow fast_, slow_;
};
class MomentumStrategy final : public Strategy {
public:
    explicit MomentumStrategy(std::size_t lookback)
        : lookback_(checked(lookback)), window_(lookback_ + 1) {}
    std::size_t warmup() const override { return lookback_ + 1; }
    bool onClose(const DailyBar& bar, bool) override {
        window_.push(bar.close);
        return window_.full() && bar.close > window_.oldest();
    }
private:
    static std::size_t checked(std::size_t n) {
        if (!n || n > 2000) throw std::invalid_argument("Momentum lookback must be 1-2000 sessions.");
        return n;
    }
    std::size_t lookback_;
    RollingWindow window_;
};
class RsiMeanReversionStrategy final : public Strategy {
public:
    RsiMeanReversionStrategy(std::size_t rsiPeriod = 2, std::size_t trendWindow = 200,
        double entryBelow = 10, double exitAbove = 70)
        : period_(rsiPeriod), entryBelow_(entryBelow), exitAbove_(exitAbove), trend_(checked(trendWindow)) {
        if (!period_ || period_ > 100) throw std::invalid_argument("RSI period must be 1-100.");
        if (!(entryBelow > 0 && entryBelow < exitAbove && exitAbove < 100))
            throw std::invalid_argument("Require 0 < entry < exit < 100.");
    }
    std::size_t warmup() const override { return std::max(trend_.size(), period_ + 1); }
    bool onClose(const DailyBar& bar, bool inPosition) override {
        trend_.push(bar.close); updateRsi(bar.close);
        if (!trend_.full() || changes_ < period_) return false;
        const double value = rsi();
        if (inPosition) return value <= exitAbove_;
        return bar.close > trend_.mean() && value < entryBelow_;
    }
private:
    static std::size_t checked(std::size_t n) {
        if (!n || n > 2000) throw std::invalid_argument("Trend window must be 1-2000.");
        return n;
    }
    void updateRsi(double close) {
        if (hasPrev_) {
            const double change = close - prev_;
            const double gain = std::max(change, 0.0), loss = std::max(-change, 0.0);
            const double n = static_cast<double>(period_);
            if (changes_ < period_) {
                sumGain_ += gain; sumLoss_ += loss;
                if (++changes_ == period_) { avgGain_ = sumGain_ / n; avgLoss_ = sumLoss_ / n; }
            } else {
                avgGain_ = (avgGain_ * (n - 1) + gain) / n;
                avgLoss_ = (avgLoss_ * (n - 1) + loss) / n;
            }
        }
        prev_ = close; hasPrev_ = true;
    }
    double rsi() const {
        if (avgLoss_ == 0) return avgGain_ == 0 ? 50.0 : 100.0;
        return 100.0 - 100.0 / (1.0 + avgGain_ / avgLoss_);
    }
    std::size_t period_;
    double entryBelow_, exitAbove_;
    RollingWindow trend_;
    bool hasPrev_ = false;
    double prev_ = 0, sumGain_ = 0, sumLoss_ = 0, avgGain_ = 0, avgLoss_ = 0;
    std::size_t changes_ = 0;
};
}
