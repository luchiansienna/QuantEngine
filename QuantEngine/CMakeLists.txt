# CMakeList.txt : CMake project for QuantEngine, include source and define
# project specific logic here.
#



# TODO: Add tests and install targets if needed.
add_library(QuantEngine STATIC
    src/pricing/BlackScholes.cpp
    src/pricing/ImpliedVolatility.cpp
 "include/quant/fixed_income/Cashflow.h" "include/quant/fixed_income/Discounting.h" "src/fixed_income/Discounting.cpp" "include/quant/fixed_income/Bond.h" "src/fixed_income/Bond.cpp"
    src/fixed_income/Bond.cpp)

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