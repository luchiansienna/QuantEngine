# CMakeList.txt : CMake project for QuantEngine, include source and define
# project specific logic here.
#



# TODO: Add tests and install targets if needed.
add_library(QuantEngine STATIC
    src/pricing/BlackScholes.cpp
    src/pricing/ImpliedVolatility.cpp
 "include/quant/fixed_income/Cashflow.h" "include/quant/fixed_income/Discounting.h" "src/fixed_income/Discounting.cpp" "include/quant/fixed_income/Bond.h" "src/fixed_income/Bond.cpp"
    src/fixed_income/Bond.cpp "include/quant/fixed_income/YieldToMaturity.h" "src/fixed_income/YieldToMaturity.cpp"
  src/fixed_income/YieldToMaturity.cpp 
  "include/quant/fixed_income/Duration.h" "src/fixed_income/Duration.cpp" "include/quant/fixed_income/DV01.h" "src/fixed_income/DV01.cpp" "include/quant/fixed_income/Convexity.h" "src/fixed_income/Convexity.cpp" "include/quant/fixed_income/RateScenario.h" "include/quant/fixed_income/RateScenarioEngine.h" "src/fixed_income/RateScenarioEngine.cpp")

target_include_directories(
    QuantEngine
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_compile_features(
    QuantEngine
    PUBLIC
        cxx_std_20
)