#pragma once
#include <cstddef>
#include <stdexcept>
#include <vector>
#include <quant/strategies/MovingAverageBacktest.h>

namespace quant::strategies {
// Use a fresh instance per run. Decisions see one bar at a time and fill next open.
class Strategy {
public:
    virtual ~Strategy() = default;
    // Number of closes needed for a valid decision; also first eligible fill index.
    virtual std::size_t warmup() const = 0;
    virtual bool onClose(const DailyBar& bar, bool inPosition) = 0;
};
class RollingWindow {
public:
    explicit RollingWindow(std::size_t size) : values_(size, 0.0) {
        if (!size) throw std::invalid_argument("Rolling window must be positive.");
    }
    void push(double value) {
        if (count_ == values_.size()) sum_ -= values_[next_]; else ++count_;
        values_[next_] = value;
        sum_ += value;
        next_ = (next_ + 1) % values_.size();
    }
    bool full() const { return count_ == values_.size(); }
    std::size_t size() const { return values_.size(); }
    long double mean() const {
        if (!count_) throw std::logic_error("Rolling window is empty.");
        return sum_ / count_;
    }
    double oldest() const {
        if (!full()) throw std::logic_error("Rolling window is not full.");
        return values_[next_];
    }
private:
    std::vector<double> values_;
    std::size_t next_ = 0, count_ = 0;
    long double sum_ = 0;
};
}
