include(FetchContent)

FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.7.1
)

FetchContent_MakeAvailable(Catch2)

add_executable(
    QuantEngineTests
    BlackScholesTests.cpp
)

target_link_libraries(
    QuantEngineTests
    PRIVATE
        QuantEngine
        Catch2::Catch2WithMain
)

include(CTest)
include(Catch)

catch_discover_tests(QuantEngineTests)
add_executable(RiskAnalyticsTests RiskAnalyticsTests.cpp)
target_link_libraries(RiskAnalyticsTests PRIVATE QuantEngine)
add_test(NAME RiskAnalyticsTests COMMAND RiskAnalyticsTests)
