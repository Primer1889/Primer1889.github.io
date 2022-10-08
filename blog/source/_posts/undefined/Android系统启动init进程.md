---
layout: android
catalog: true
title: Android 系统 Init
subtitle: 本系列文章基于 Android 11-r21 master
date: 2022-09-29 22:55:05
tags: AOSP
header-img: /img/220928/android_init_bg.png
sticky: 5
---


# 设备启动简述

**1、BIOS 加载**
- 加电自检（基本输出/输入系统 stdio）
    - 硬件自检`POST`
- 外部存储设备`启动顺序排序`，下一个获得控制权的设备
- 读取激活分区第一个扇区的 `主引导记录`（512 字节）
    - 负责分区读写合法性判断
    - 负责引导信息定位
    - 数据存储
        - 调用操作系统的机器码
        - 分区表
            - 主分区是激活的，激活分区的第一个扇区是`卷引导记录`（告诉计算机操作系统在分区的位置-系统盘分区）
            - 当只有一个系统时候，控制权将交给某分区；否则将启动`启动管理器`让用户选择操作系统
        - 主引导记录签名
            - 最后两个字节是 `0x55、0xAA` 表示可启动设备

**2、kernel 加载**

- 确定操作系统之后获得控制权，接着加载内核到内存
- Linux 系统内核位于`boot/kernel`
- 运行第一个程序`sbin/init`
- 解析配置文件`etc/initab`创建第一个用户进程，进程 `id 1`
- 之后 init 进程分别加载系统各模块的进程


# Android 启动
Android 不存在 BIOS，但是有 `Bootloader`，Android 不存在硬盘，但是有`ROM`（类似硬盘，由不同区域划分）。

**1、Bootloader**
- 初始化硬件设备
- 建立内存空间映射（为系统调用服务）

**2、ROM**
- /boot ：引导程序 —— 操作内核、内存的程序
- /system ：相当于系统盘 —— 操作系统、系统程序
- /recovery ： 恢复分区 —— 恢复操作系统（刷机）
- /data ： 用户数据 —— 安装程序、外部数据
- /cache ： 系统缓存
- /scared ： 用户存储空间 —— 相册、音乐


**3、Bootloader 加载**
- 加电，引导芯片加载 ROM 预设代码执行
- 芯片查找 Bootloader 代码并加载到内存
- Bootloader 开始执行，查找操作系统、加载 Linux 内核到内存
- Linux 内核开始执行，初始化硬件、加载驱动、挂载文件系统、创建并启动第一个用户空间 `init 进程`

# Linux 内核加载

**1、idle 进程（pid = 0）**
- Linux 系统第一个进程
- 进程名字`init_task`，退化后的`idle`
- 不是通过`fork、kernel_thread`创建的进程
- 主要负责进程调度工作，进入无限循环

**2、init 进程（pid = 1）**
- 用户空间第一个进程
- 启动前部分：完成创建和内核初始化
- 启动后部分：完成 Android 系统初始化
- /system/core/init/init.cpp


**3、kthreadd 进程（pid = 2）**
- Linux 内核管理者，内核线程的父进程
- 主要负责内核线程的调度和管理
- 由 idle 通过`kernel_thead`创建

# Android 系统启动

相关文件：
- /system/core/init/main.cpp
- /system/core/init/first_state_main.cpp
- /system/core/init/first_state_init.cpp
- /system/core/init/main.cpp
- /system/core/init/selinux.cpp
- /system/core/init/main.cpp
- /system/core/init/init.cpp
- /system/core/init/property_service.cpp
- /system/core/init/subcontext.h
- /system/core/init/subcontext.cpp
- /system/core/init/builtins.cpp
- /system/core/init/action.cpp


用户空间第一个进程（init 进程）启动意味着开始 Android 系统初始化开始，初始化被划分为几个不同的阶段，我们主要关注 main 函数的执行，主要负责准备和构建文件系统。

```cpp
//main.cpp
int main(int argc, char** argv) {
    
    //略

   if (argc > 1) {
       if (!strcmp(argv[1], "subcontext")) {
           //内核日志初始化，内核的源码在另外的仓库，暂时看不了
           android::base::InitLogging(argv, &android::base::KernelLogger);
           //函数映射，调用的可都是内核函数【参考builtins.cpp】
           const BuiltinFunctionMap& function_map = GetBuiltinFunctionMap();
           //4、还是进入 subcontext.cpp，开始上下文
           return SubcontextMain(argc, argv, &function_map);
        }

        //2、执行第二阶段前，建立Linux安全机制
        if (!strcmp(argv[1], "selinux_setup")) {
            return SetupSelinux(argv);
        }

        if (!strcmp(argv[1], "second_stage")) {
            //3、初始化第二阶段
            return SecondStageMain(argc, argv);
        }
    }

    //1、初始化第一阶段
    return FirstStageMain(argc, argv);
}
```

## 初始化（第一阶段）

为文件系统准备和创建环境

```cpp
//first_state_init.cpp
int FirstStageMain(int argc, char** argv) {
    //准备文件系统
    CHECKCALL(clearenv());
    //Linux 下一切皆文件，socket 也就是一个特殊文件
    CHECKCALL(mkdir("/dev/socket", 0755));
    //755 是不是很熟悉的 chmod 755 访问权限；7/5/5 —— 用户/用户组/其他用户（421组合）
    CHECKCALL(chmod("/proc/cmdline", 0440));
    //重要的启动配置文件，更多请参考 https://www.kernel.org/doc/html/
    android::base::ReadFileToString("/proc/bootconfig", &bootconfig);
        
    //必不可少的日志
    //经过前面的准备、检验工作，到这里第一阶段初始化工作就要开始
    InitKernelLogging(argv);
    
    //检查虚拟内存是否释放、如未开启则需要重启
    auto old_root_dir = std::unique_ptr<DIR, decltype(&closedir)>{opendir("/"), closedir};
    //加载内核模块，可能还记得 major（内核主版本）、 minor（内核次版本），版本信息在加载前都会去解析，
    if (!LoadKernelModules(IsRecoveryMode() 
    && !ForceNormalBoot(cmdline, bootconfig), 
    want_console,want_parallel, module_count)) {
       //略
    }
    
    //在 recovery 模式下不允许创建设备啊
    if (!IsRecoveryMode()) {
        created_devices = DoCreateDevices();
    }
    
    //为初始化第二阶段准备
    ///second_stage_resource/system/etc/ramdisk/build.prop
    std::string dest = GetRamdiskPropForSecondStage();
    
    //执行第一阶段的挂载
    if (!DoFirstStageMount(!created_devices))
    
    //神奇的 execv 函数：使用一个新的进程替换当前进程映像继续执行，紧接着通过传入的 `selinux_setup`参数执行下一个函数
    //更多 execv 参考：https://linux.die.net/man/3/execv
    const char* path = "/system/bin/init";
    const char* args[] = {path, "selinux_setup", nullptr};
    execv(path, const_cast<char**>(args));
    //第一阶段大致到此结束
```

准备系统调用函数映射。

```cpp
//builtins.cpp
//这个内置函数映射是什么意思呢？
// 比如  {"start",{1,1,{false,  do_start}}},
// start 命令对应的执行的函数就是 buildins.cpp 里面定义的 do_start 函数
const BuiltinFunctionMap& GetBuiltinFunctionMap() {
    constexpr std::size_t kMax = std::numeric_limits<std::size_t>::max();
    static const BuiltinFunctionMap builtin_functions = {
        {"bootchart",               {1,     1,    {false,  do_bootchart}}},
        {"chmod",                   {2,     2,    {true,   do_chmod}}},
        {"chown",                   {2,     3,    {true,   do_chown}}},
        {"class_reset",             {1,     1,    {false,  do_class_reset}}},
        {"class_restart",           {1,     2,    {false,  do_class_restart}}},
        {"class_start",             {1,     1,    {false,  do_class_start}}},
        {"class_stop",              {1,     1,    {false,  do_class_stop}}},
        {"copy",                    {2,     2,    {true,   do_copy}}},
        {"copy_per_line",           {2,     2,    {true,   do_copy_per_line}}},
        {"domainname",              {1,     1,    {true,   do_domainname}}},
        {"enable",                  {1,     1,    {false,  do_enable}}},
        {"exec",                    {1,     kMax, {false,  do_exec}}},
        {"exec_background",         {1,     kMax, {false,  do_exec_background}}},
        {"exec_start",              {1,     1,    {false,  do_exec_start}}},
        {"export",                  {2,     2,    {false,  do_export}}},
        {"hostname",                {1,     1,    {true,   do_hostname}}},
        {"ifup",                    {1,     1,    {true,   do_ifup}}},
        {"init_user0",              {0,     0,    {false,  do_init_user0}}},
        {"insmod",                  {1,     kMax, {true,   do_insmod}}},
        {"installkey",              {1,     1,    {false,  do_installkey}}},
        {"interface_restart",       {1,     1,    {false,  do_interface_restart}}},
        {"interface_start",         {1,     1,    {false,  do_interface_start}}},
        {"interface_stop",          {1,     1,    {false,  do_interface_stop}}},
        {"load_exports",            {1,     1,    {false,  do_load_exports}}},
        {"load_persist_props",      {0,     0,    {false,  do_load_persist_props}}},
        {"load_system_props",       {0,     0,    {false,  do_load_system_props}}},
        {"loglevel",                {1,     1,    {false,  do_loglevel}}},
        {"mark_post_data",          {0,     0,    {false,  do_mark_post_data}}},
        {"mkdir",                   {1,     6,    {true,   do_mkdir}}},
        {"mount_all",               {0,     kMax, {false,  do_mount_all}}},
        {"mount",                   {3,     kMax, {false,  do_mount}}},
        {"perform_apex_config",     {0,     0,    {false,  do_perform_apex_config}}},
        {"umount",                  {1,     1,    {false,  do_umount}}},
        {"umount_all",              {0,     1,    {false,  do_umount_all}}},
        {"update_linker_config",    {0,     0,    {false,  do_update_linker_config}}},
        {"readahead",               {1,     2,    {true,   do_readahead}}},
        {"remount_userdata",        {0,     0,    {false,  do_remount_userdata}}},
        {"restart",                 {1,     2,    {false,  do_restart}}},
        {"restorecon",              {1,     kMax, {true,   do_restorecon}}},
        {"restorecon_recursive",    {1,     kMax, {true,   do_restorecon_recursive}}},
        {"rm",                      {1,     1,    {true,   do_rm}}},
        {"rmdir",                   {1,     1,    {true,   do_rmdir}}},
        {"setprop",                 {2,     2,    {true,   do_setprop}}},
        {"setrlimit",               {3,     3,    {false,  do_setrlimit}}},
        {"start",                   {1,     1,    {false,  do_start}}},
        {"stop",                    {1,     1,    {false,  do_stop}}},
        {"swapon_all",              {0,     1,    {false,  do_swapon_all}}},
        {"enter_default_mount_ns",  {0,     0,    {false,  do_enter_default_mount_ns}}},
        {"symlink",                 {2,     2,    {true,   do_symlink}}},
        {"sysclktz",                {1,     1,    {false,  do_sysclktz}}},
        {"trigger",                 {1,     1,    {false,  do_trigger}}},
        {"verity_update_state",     {0,     0,    {false,  do_verity_update_state}}},
        {"wait",                    {1,     2,    {true,   do_wait}}},
        {"wait_for_prop",           {2,     2,    {false,  do_wait_for_prop}}},
        {"write",                   {2,     2,    {true,   do_write}}},
    };
    return builtin_functions;
}
```

## 建立 SELinux

第一阶段最后 execv 函数传入初始化参数 `selinux_setup`，执行流程回到 main.cpp，由 strcmp 函数判断进入下一个流程。

```cpp
//main.cpp
if (!strcmp(argv[1], "selinux_setup")) {
    return SetupSelinux(argv);
}
```

```cpp
//SetupSelinux.cpp
int SetupSelinux(char** argv) {
    //准备安全策略，某路径下的 SEPolicy.zip 文件
    PrepareApexSepolicy();
    //读取安全策略
    ReadPolicy(&policy);
    //加载安全策略
    LoadSelinuxPolicy(policy);
    //强制执行策略
    SelinuxSetEnforcement();

    //关键代码又来了，调用 execv，初始化参数 second_stage，准备执行初始化第二阶段
    const char* path = "/system/bin/init";
    const char* args[] = {path, "second_stage", nullptr};
    execv(path, const_cast<char**>(args));
}
```

## 初始化（第二阶段）
execv 调用又来了，本次传入初始化参数是 `second_stage`，执行流程再次回到 main.cpp，紧接着开始第二阶段的初始化。

```cpp
//main.cpp
if (!strcmp(argv[1], "second_stage")) {
    return SecondStageMain(argc, argv);
}
```
```cpp
//init.cpp
int SecondStageMain(int argc, char** argv) {
    //如果设备解锁 unlock，将允许 adb root 加载调试信息
    const char* force_debuggable_env = getenv("INIT_FORCE_DEBUGGABLE");
    bool load_debug_prop = false;
    if (force_debuggable_env && AvbHandle::IsDeviceUnlocked()) {
        load_debug_prop = "true"s == force_debuggable_env;
    }
    
    //属性初始化，创建属性信息并存储在 /dev/__properties__/property_info 文件中
    //从其他多个文件读取数据，构造成 PropertyInf 属性集合
    //还处理了几个重要的信息：这些被处理的信息将被 InitPropertySet(name,value) 函数写入 property_info 文件中
    //    ProcessKernelDt();
    //    ProcessKernelCmdline();
    //    ProcessBootconfig();
    //    ExportKernelBootProps();//遇到了陌生又熟悉的 ro.boot 键值对属性，例如 "ro.boot.mode"
    
    //PropertyLoadBootDefaults();//上述收集到的属性信息都将被加载，如果是恢复模式（刷机）IsRecoveryMode()，那么会加载默认的属性文件 /prop.default 
    //GetRamdiskPropForSecondStage(); //第二阶段需要的属性去哪里加载？/second_stage_resources/system/etc/ramdisk/build.prop
    PropertyInit();
    
    //挂载一些其他的文件系统：apex、linkerconfig
    MountExtraFilesystems();
    
    //注册 socket 监听
    Epoll epoll;
    InstallSignalFdHandler(&epoll);
    InstallInitNotifier(&epoll);

    //启动属性服务，通过 socket 通讯
    StartPropertyService();
    
    //oem：刷机的同学可能会记得 ‘开发者选项’ 中就有个选项是 ‘OEM解锁’——是否允许解锁引导加载程序，刷机时候我们通常会打开此选项
    export_oem_lock_status(); 
    
    //原来 usb 对应的属性是 sys.usb.controller，所在文件 /sys/class/udc
    SetUsbController();
    
    //内核版本 ro.kernel.version，包含主版本 major 和次版本 minor
    SetKernelVersion();
    
    //初始化 subcontext 一个进程【请转到 subcontext.h】
    InitializeSubcontext();
    
    //加载启动脚本
    //首先通过 Property 加载 ro.boot.init_rc 属性值，如果为空则加载 /system/etc/init/hw/init.rc
    //actionManager 添加一堆不知道是什么的 action 进入队列等待执行
    //serviceList 通过解析一些 /init.rc、/system/etc/init、/vendor/etc/init 获取的服务
    LoadBootScripts(actionManager, serviceList);

    //准备进入无限循环，此前重置进程优先级
    //prio 优先级范围 0～139，值越小优先级越高
    setpriority(PRIO_PROCESS, 0, 0);
    while (true) {
        //epoll 负责事件处理，默认情况 epoll 会休眠，类似阻塞直到有事件到来；关于 epoll 
        //如果有事件需要处理，等待事件将被置为0，也就是需要马上处理事件
        auto epoll_timeout = std::optional<std::chrono::milliseconds>{kDiagnosticTimeout};
        
        //每次都会检查是否关机
        auto shutdown_command = shutdown_state.CheckShutdown();
        
        //还会检测如果进程需要重启，将立即启动
        auto next_process_action_time = HandleProcessActions();
    
        //如果事件队列不为空，将 fron 第一个事件取出进行处理，递归进行，加锁同步进行
        HandleControlMessage();
        //至此，第二阶段完毕
    }
}
```

```cpp
//subcontext.h
class Subcontext {
  public:
    Subcontext(std::vector<std::string> path_prefixes, std::string context, bool host = false)
        : path_prefixes_(std::move(path_prefixes)), context_(std::move(context)), pid_(0) {
        if (!host) {
            //构造函数中直接 fork 一个进程
            Fork();
        }
    }
}

```

```cpp
//subcontext.cpp
void Subcontext::Fork() {
    //创建一个对应上下文的 socket
    unique_fd subcontext_socket;
    if (!Socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0, &socket_, &subcontext_socket)) {
        return;
    }
    
#if defined(__ANDROID__)
    //subcontext 的初始化需要在挂载 default 的空间下，为了能够访问 /apex
    if (auto result = SwitchToMountNamespaceIfNeeded(NS_DEFAULT); !result.ok()) {
        LOG(FATAL) << "Could not switch to \"default\" mount namespace: " << result.error();
    }
#endif

   //获取下一阶段初始化的执行路径，至关重要啊兄弟们
   //Android11 源码约450G，目前使用 vscode 搜索某关键字，
   //搜索效果不是很好，搜索太慢了，似乎索引建立太慢？有什么更好的工具可以替换 vscode ???  
   //工具 ———— https://github.com/oracle/opengrok  Oracle 开源的真是福利好。
   // 
   //----- 假装我是分割线 -----
   //
   //那么 GetExecutablePath 实现在哪里？源码中没看到啊
   //⚠️注意了：
   // 1、调用 GetExecutablePath() 所在命名空间是 using android::base::GetExecutablePath;
   // 2、看看引入的头文件 #include <android-base/properties.h>，注意咯，是尖括号<>引入方式，而不是双引号“”本地引入，说明本地项目下根本找不到，是通过系统连接进来的。
   // 3、查阅官网，发现文件实现在内核仓库有一份可查阅。https://source.android.google.cn/devices/tech/config/kernel?hl=zh-cn
   auto init_path = GetExecutablePath();
   auto child_fd_string = std::to_string(child_fd);
   //终于又等到了 execv 函数，注意传参 subcontext，是不是又回到了 main.cpp【或许你对 main.cpp 已没有了印象，毕竟学习就是一个不断重复的过程，反复的、反复的、反复的印象也就深刻了】
   const char* args[] = {init_path.c_str(), "subcontext", context_.c_str(),child_fd_string.c_str(), nullptr};
   execv(init_path.data(), const_cast<char**>(args));
}
```

```cpp
//main.cpp
//有没有一种可能，地球是圆的，你在此处静候，我一直往北走，最后还能相遇不是吗？
if (!strcmp(argv[1], "subcontext")) {
    android::base::InitLogging(argv, &android::base::KernelLogger); 
    const BuiltinFunctionMap& function_map = GetBuiltinFunctionMap();
    return SubcontextMain(argc, argv, &function_map);
}
```


```cpp
//subcontext.cpp
int SubcontextMain(int argc, char** argv, const BuiltinFunctionMap* function_map) {
    
    //主要还是干两件事，创建上下文进程、并进入无限循环
    auto subcontext_process = SubcontextProcess(function_map, context, init_fd);
    // Restore prio before main loop
    setpriority(PRIO_PROCESS, 0, 0);
    subcontext_process.MainLoop();
}
```

```cpp
//subcontext.cpp
class SubcontextProcess {
  public:
    SubcontextProcess(const BuiltinFunctionMap* function_map, std::string context, int init_fd)
        : function_map_(function_map), context_(std::move(context)), init_fd_(init_fd){};
    void MainLoop();
}

void SubcontextProcess::MainLoop() {
    pollfd ufd[1];
    ufd[0].events = POLLIN;
    ufd[0].fd = init_fd_;
    
    //进入无限循环，处理循环事件的还是 poll 具柄，使用 socket 通讯
    while (true) {
        //处理的消息类型有两种：执行型、数据解析型
        auto subcontext_command = SubcontextCommand();
        auto reply = SubcontextReply();
        switch (subcontext_command.command_case()) {
            case SubcontextCommand::kExecuteCommand: {
                RunCommand(subcontext_command.execute_command(), &reply);
                break;
            }
            case SubcontextCommand::kExpandArgsCommand: {
                ExpandArgs(subcontext_command.expand_args_command(), &reply);
                break;
            }
            default:
                LOG(FATAL) << "Unknown message type from init: "
                           << subcontext_command.command_case();
        }
        
        //循环中干的事就是不断分发消息，到此第二阶段初始化节本结束
        //？？？呵，一脸懵逼吧，消息发出去之后呢？之后又去执行哪里了🤔️
        if (auto result = SendMessage(init_fd_, reply); !result.ok()) {
            LOG(FATAL) << "Failed to send message to init: " << result.error();
        } 
    }
}
```

# 最后
Android 系统启动由 Linux 创建 init 进程，init 进程通过解析 `init.rc` 等几个初始化配置文件，根据解析数据继续创建、启动其他的进程或服务，初始化第一阶段执行完紧接着建立 SELinux 机制，再执行初始化第二阶段。

接下来会执行到哪了呢？`init.rc` 初始化配置文件的内容具体是什么？初始化配置文件是从哪里加载的，文件存放在哪里？不得不说，作为新手的我确实还有很多疑问，相信后续能够进一步了解。


**其他知识**

- Ramdisk: 将一块内存当作物理磁盘使用（虚拟内存）
- signalfd: 信号抽象的文件描述符（一切皆文件），信号异步操作将转换问 I/O 操作
- Epoll：多路复用、批量处理文件描述符，poll 升级版
- GSI：generic system image（系统镜像）
- opengrok：一个快速可用的源代码搜索和交叉引用引擎

**参考链接**

- Linux 内核文档：https://www.kernel.org/doc/html/
- Linux 文档：https://linux.die.net/
