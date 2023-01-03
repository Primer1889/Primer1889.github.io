---
title: Android-官方文档
catalog: true
date: 2022-10-31 21:20:11
subtitle: 
header-img: /img/2210/page-native.jpg
tags: AOSP
categories:
---

# 架构

- application framework
- binder ipc proxies
- Android system service
    - media service
        - audio
        - camera
        - media player
    - system service
        - ams
        - wms
- hal【硬件接口】
    - camera hal
    - audio hal
    - graphics hal
- linux kernel
    - camera driver
    - audio driver
    - display driver    



## 架构资源
1、hal：
    - 绑定式 HAL：通过 HIDL 或 AIDL 表示，Android framework 和 HAL 之间通过 Binder 通讯。
    - 直通式 HAL：Android 8 及其以上设备可用

2、aidl：
    - 抽象化 IPC 工具，构造 c++ 与 Java 的绑定；通常一个进程无法访问另一个进程的内存，如需通讯进程需将对象分解成操作系统理解的原语言
    - 线程调用
        - 本地进程线程调用：可能发生在当前线程执行
        - oneway：修饰远程调用，发送数据并立即返回；修复本地调用无效 
        - 远程进程线程调用：来自线程池未知线程
    - 定义 aidl
        - android sdk 会生成 .aidl 文件的 IBinder 接口，接口通常拥有一个名为 Stub 的内部抽象类，具体需要实现 Stub 类
        - 实现 service 重写 onbind，返回 Stub 实现类给客户端
    - 工作原理
        - 使用 binder 内核驱动程序进行调用

3、Binder：
    - 自身应用同进程使用服务可使用
    - 扩展 Binder 类实现公共方法，使用 bindService 绑定 service 和 ServiceConnection

4、Messenger：
    - 不同进程间可使用，无需使用 aidl，适用单线程
    - 服务端：扩展 service 且内部包含 messenger，messenger 绑定一个 handle 并通过 onbind 返回 messenger
    - 客户度：通过 binderservice 绑定 serviceConnection，connection 内部通过服务链接获得 messenger，messenger 接口可以发消息了