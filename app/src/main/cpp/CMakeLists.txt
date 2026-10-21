cmake_minimum_required(VERSION 3.22.1)
project(troubadour LANGUAGES CXX)

find_package(oboe REQUIRED CONFIG)

add_library(troubadour SHARED
        audio_engine.cpp
        jni_bridge.cpp)

target_link_libraries(troubadour
        oboe::oboe
        mediandk
        android
        log)

# Required by Google Play for apps with native code (16 KB memory pages).
target_link_options(troubadour PRIVATE "-Wl,-z,max-page-size=16384")
