add_executable(
    QuantConsole
    main.cpp
)

target_link_libraries(
    QuantConsole
    PRIVATE
        QuantEngine
)