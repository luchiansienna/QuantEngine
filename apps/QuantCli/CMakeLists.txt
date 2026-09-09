add_executable(
    QuantCli
    main.cpp
)

target_link_libraries(
    QuantCli
    PRIVATE
        QuantEngine
)
