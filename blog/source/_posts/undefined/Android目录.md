---
title: 认识 AOSP 工程目录（一）
catalog: true
date: 2022-10-18 21:20:48
subtitle: 基于 android-11-r21
header-img: /img/2210/page-native.jpg
tags: AOSP
categories:
---

# AOSP

不知道该从哪下手，那就先了解了解。

- art【Android runtime】
    - adbconnection【adb 连接】
    - artd【?】
    - benchmark【衡量代码性能基准】[参考](https://developer.android.google.cn/jetpack/androidx/releases/benchmark?hl=zh-cn)
    - build【?】
    - cmdline【命令行】
    - complier【编译，elf】
        - dex【字节码，内敛方法】
        - jit【即时编译，arm/arm64/x86/x86_64转换】
        - linker【链接】
        - optimizing【优化】
        - trampolines【?】
    - dalvikvm【dalvik 虚拟机启动】
    - dex2oat【字节码转 oat 文件，elf】
    - dexdump【分析 dex】
    - dexlayout【dex 分析】[参考](https://source.android.google.cn/docs/core/runtime/improvements?hl=zh-cn)
    - dexlist【分析 dex】
    - dexoptanalyzer【dex 优化分析】
    - disassembler【反汇编】
    - imgdiag【?】
    - libartbase【?】
    - libartpalette【?】
    - libservice【?】
    - libarttools【?】
    - libdexfile【dex 文件】
    - libelffile【elf 文件】
        - dwarf【调试？】
    - libnativebridge【桥接】
    - libnativeloader【加载】
    - libprofile【性能分析】[参考](https://developer.android.google.cn/studio/profile/android-profiler?hl=zh-cn)
    - oatdump【反编译 oat 文件】
    - odrefresh【?】
    - openjdkjvm【?】
    - openjdkjvmti【内存动态监测】
    - prefetto_hprof【性能分析】[参考](https://developer.android.google.cn/studio/command-line/perfetto?hl=zh-cn)
    - profman【hprof 相关】
    - runtime 【运行环境】
        - arch【指令集】
        - gc【垃圾回收】
            - allocator【内存分配】
            - collector【内存回收】
            - space【内存块】
        - jit【即时编译】
        - verifier【校验】
    - sigchainlib【信号?】
    - simulator【模拟器?】

- bionic【仿生的 Linux】
    - apex【一种容器格式】[参考](https://source.android.google.cn/docs/core/ota/apex?hl=zh-cn)
    - benchmarks【性能测试准则】[参考](https://developer.android.google.cn/jetpack/androidx/releases/benchmark?hl=zh-cn)
    - libc
        - bionic
        - dns
    - libdl
    - libfdtrack【fd 句柄跟踪】
    - libm
    - libstdc++【cpp 标准库】
    - linker【连接器】

- bootable【启动引导】
    - recovery【恢复】
        - applypatch【补丁工具】
        - edify【刷机脚本】
        - fastboot【刷机模式】
        - fuse_sideload【文件传输】[参考](https://source.android.google.cn/docs/core/storage/fuse-passthrough?hl=zh-cn)
        - install 【adb 安装、fuse 安装】
        - minadbd【最小化 adb 服务端】
        - minui【?】
        - otautil【无线下载更新】[参考](https://source.android.google.cn/docs/core/ota?hl=zh-cn)
        - recovery_ui【恢复模式界面】
        - updater【系统更新】
- build【略】
- compatibility【兼容性计划】[参考](https://source.android.google.cn/docs/compatibility/overview?hl=zh-cn)
    - cdd【兼容性限制文档】
        - 设备类型【手机、手表】
        - 应用程序【web 接口、native 接口、runtime 相关等】
        - 硬件【显示、相机、USB、音频等】
        - 多媒体【音视频编码等】
        - 安全【权限、文件系统、隐私等】
- cts【兼容性测试】[参考](https://source.android.google.cn/docs/compatibility/cts?hl=zh-cn)
    - apps
    - hostsidetests
    - libs
- dalvik
- developers
- development
- device
- external
- frameworks
- hardware
- kernel
- libcore
- libnativehelper
- manifest
- packages
- pdk
- platform_testing
- prebuilts
- sdk
- system
- test
- toolchain
- tools