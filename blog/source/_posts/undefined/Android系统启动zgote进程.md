---
title: Android 系统 zygote 
catalog: true
date: 2022-09-29 22:56:05
subtitle: 俗称 Java 世界的鼻祖
header-img: /img/220928/android_zygot_bg.png
tags: AOSP
sticky: 7
categories:
---


相关文件：
- /system/core/init/init.cpp
- /system/etc/init/hw/init.rc  (源码工程没找到，是从手机上获取)
- /system/etc/init/hw/init.zygote32.rc （手机上获取）
- /system/etc/init/hw/init.zygote64_32.rc （手机上获取）
- /system/core/init/action.cpp
- /system/core/init/service.cpp
- /system/core/init/service_list.cpp
- frameworks/base/core/java/com/android/internal/os/ZygoteInit.java
- frameworks/base/core/java/com/android/internal/os/ZygoteServer.java
- frameworks/base/core/java/com/android/internal/os/Zygote.java
- frameworks/base/core/java/com/android/internal/os/WrapperInit.java


# 解析初始化配置文件 

初始化配置文件包括但不限于 init.rc、hw/init.rc。带着的疑惑继续看源码，之前提到执行到初始化第二阶段时 init 进程进入无限的轮询（loop），似乎不知去向何处？疑惑是在等待接收消息后再做处理，第二阶段中创建 init 进程中有一个重要的函数`LoadBootScripts(actionManager,serviceList)`——————加载启动脚本，相当重要，与`init.rc`文件存在千丝万缕的关系。

```cpp
//init.cpp
static void LoadBootScripts(ActionManager& action_manager, ServiceList& service_list) {
    Parser parser = CreateParser(action_manager, service_list);
    std::string bootscript = GetProperty("ro.boot.init_rc", "");
    if (bootscript.empty()) {
        //解析 init.rc，启动的关键文件
        parser.ParseConfig("/system/etc/init/hw/init.rc");
        if (!parser.ParseConfig("/system/etc/init")) {
            late_import_paths.emplace_back("/system/etc/init");
        }
        
        parser.ParseConfig("/system_ext/etc/init");
        if (!parser.ParseConfig("/vendor/etc/init")) {
            //vendor 厂商相关的初始化配置
            late_import_paths.emplace_back("/vendor/etc/init");
        }
        if (!parser.ParseConfig("/odm/etc/init")) {
            late_import_paths.emplace_back("/odm/etc/init");
        }
        if (!parser.ParseConfig("/product/etc/init")) {
            late_import_paths.emplace_back("/product/etc/init");
        }
    } else {
        parser.ParseConfig(bootscript);
    }
}
```

```cpp
//init.cpp
void SecondStageMain(){

    //数据解析获得，开始构建 action 队列
    ActionManager& am = ActionManager::GetInstance();
    am.QueueBuiltinAction(SetupCgroupsAction, "SetupCgroups");
    .... etc

    //触发启动
    am.QueueEventTrigger("init");
    
    //若处于充电模式将延迟初始化
    std::string bootmode = GetProperty("ro.bootmode", "");
    if (bootmode == "charger") {
        am.QueueEventTrigger("charger");
    } else {
        am.QueueEventTrigger("late-init");
    }
    
    //init 进程进入无限轮训
    while(true){
        //开始通过 command 命令执行 inir.rc 脚本各项服务以及初始化
        if (!(prop_waiter_state.MightBeWaiting() || Service::is_exec_service_running())) {
            am.ExecuteOneCommand();
        }
        if (!(prop_waiter_state.MightBeWaiting() || Service::is_exec_service_running())) {

        // If there's more work to do, wake up again immediately.
        if (am.HasMoreCommands())
            epoll_timeout = 0ms;
        }
    }
}
```

在 Android 11 上，init.rc 文件位于`/system/etc/init/hw/init.rc`

![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/92ab7d4ccd7a4118a1f705928d97c212~tplv-k3u1fbpfcp-watermark.image?)

这是我在小米手机找的，rc 文件被视为 Android 初始化语言，那肯定也有自己的语法或格式，可以参考：https://www.cnblogs.com/gufanyuan/p/9350130.html

**Mark：**
- action on 后携带一组命令
- trigger 触发器，确定何时执行命令
- service 当 init 退出时启动或重启
- options 进一步控制命令执行的方式和时间
- 命令：on 每一行代表一条命令
- import 导入额外的 rc 文件需要解析

看看 rc 文件：

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/0991aad99b524f9ebc147ce1fe075047~tplv-k3u1fbpfcp-watermark.image?)

```cpp
//  /system/etc/init/hw/init.rc
# 小米系统，也有厂商自己的解析文件，需要执行属于自己的进程
# import 指明导入其他配置文件需要解析
# MIUI ADD:
import /init.miui.rc

# 还记得 SecondStageMain actionManage 吗
# am.QueueEventTrigger("early-init");
on early-init
    # 一个守护进程，负责处理 uevent 消息
    start ueventd
    # apex 服务于系统模块安装
    exec_start apexd-bootstrap

# 触发所有 action
# am.QueueEventTrigger("init");
on init
    # 创建 stdio 标准输入输出链接
    symlink /proc/self/fd/0 /dev/stdin
    # 给 sdcard 更改权限
    chmod 0770 /config/sdcardfs
    
    # 启动服务
    # 系统服务，越来越接近应用层了
    start servicemanager
    # hw——hardware，硬件服务
    start hwservicemanager
    #供应商服务
    start vndservicemanager
    # init action 就执行到这，中间省略很多命令，这里只是抽取几个，点到为止
    
# 挂载文件系统以及核心服务
# am.QueueEventTrigger("late-init");
on late-init
    # 触发 fs：Vold 控制和管理外部存储的进程
    trigger early-fs

    # 重点来了⚠️⚠️⚠️
    # import /system/etc/init/hw/init.${ro.zygote}.rc
    # zygote 进来了，常说的 Android 应用层的鼻祖
    trigger zygote-start
    
    trigger early-boot
    trigger boot

on boot
    # 启动 HAL 硬件抽象类服务
    class_start hal
    # 启动核心类服务
    class_start core
```

# 解析 zygote.rc

看上面截图，现在该执行`init.zygote32.rc、init.zygote64_32.rc`，继续往下看。
```cpp
//  /system/etc/init/hw/init.zygote32.rc
// zygote32 : 只有一个 32，那就是纯纯的为 32 位准备的

service zygote /system/bin/app_process -Xzygote /system/bin --zygote --start-system-server
    class main
    priority -20
    user root
    group root readproc reserved_disk
    socket zygote stream 660 root system
    socket usap_pool_primary stream 660 root system
    onrestart exec_background - system system -- /system/bin/vdc volume abort_fuse
    onrestart write /sys/power/state on
    onrestart restart audioserver
    onrestart restart cameraserver
    onrestart restart media
    onrestart restart netd
    onrestart restart wificond
    writepid /dev/cpuset/foreground/tasks

```

```c++
//  /system/etc/init/hw/init.zygote64_32.rc
// zygote64_32 : 前部分 64 指主要模式，后部分 32 指辅助模式；同样的也会有 zygote32_64.rc、zygote32.rc、zygote64.rc  etc.

# service 是 Android 初始化话语言的一部分，指 init 启动或退出时重新启动服务
# 显然，这里的服务名称就是‘家喻户晓’的 zygote 进程
service zygote /system/bin/app_process64 -Xzygote /system/bin --zygote --start-system-server --socket-name=zygote
    class main
    priority -20     ### 进程优先级 -20 ，值越小优先级越高，取值范围 [-20,19]
    user root        ### 由 root 用户执行 
    group root readproc reserved_disk
    socket zygote stream 660 root system
    socket usap_pool_primary stream 660 root system
    onrestart exec_background - system system -- /system/bin/vdc volume abort_fuse
    onrestart write /sys/power/state on
    onrestart restart audioserver
    onrestart restart cameraserver
    onrestart restart media
    onrestart restart netd
    onrestart restart wificond
    task_profiles ProcessCapacityHigh MaxPerformance

# zygote_secondary ？？？？？
# 你在看前面提到的‘主模式’和‘辅模式’，恰好 zygote 是 app_process64，zygote_secondary 是 app_process32，
# 刚刚好对应上文件名 init.zygote64_32.rc 【主模式是64，辅模式是32】
service zygote_secondary /system/bin/app_process32 -Xzygote /system/bin --zygote --socket-name=zygote_secondary --enable-lazy-preload
    class main
    priority -20
    user root
    group root readproc reserved_disk
    socket zygote_secondary stream 660 root system
    socket usap_pool_secondary stream 660 root system
    onrestart restart zygote
    task_profiles ProcessCapacityHigh MaxPerformance
```

# 创建 zygote Process

在初始化第二阶段 SecondStageMain 解析了 inir.rc，回到 main.cpp 知道 GetBuiltinFunctionMap 函数映射表作为参数传入 SubcontextMain，第四部分开始执行，接着看看执行流程。

```cpp
//main.cpp
return SubcontextMain(argc, argv, &function_map);

//subcontext.cpp
auto subcontext_process = SubcontextProcess(function_map, context, init_fd);

//subcontext.cpp
SubcontextProcess(const BuiltinFunctionMap* function_map, std::string context, int init_fd)
: function_map_(function_map), context_(std::move(context)), init_fd_(init_fd){};
//通过构造函数，直接将函数映射表赋值给成员 function_map_
const BuiltinFunctionMap* function_map_;

//在 SubcontextMain 中开始主循环
subcontext_process.MainLoop();

//主循环中准备执行命令
RunCommand(subcontext_command.execute_command(), &reply);

//映射表 function_map_ 被使用
//根据参数（命令）查找对应的内置函数
auto map_result = function_map_->Find(args);
//找到了命令准备执行
result = RunBuiltinFunction(map_result->function, args, context_);

//构造参数，直接调用
//回想一下，映射表中是否有着一个 item
//{"class_start", {1, 1, {false, do_class_start}}}
//do_class_start：内置函数被声明在 builtins.cpp 中，下面看看其实现
auto builtin_arguments = BuiltinArguments(context);
return function(builtin_arguments);
```

```cpp
//builtins.cpp
static Result<void> do_class_start(const BuiltinArguments& args) {
    if (android::base::GetBoolProperty("persist.init.dont_start_class." + args[1], false))
        return {};
    //服务启动
    /*
        1、ServiceList::GetInstance() 到底是什么东西啊？service 列表又是什么？
    还记得第二阶段初始化 SecondStageMain 中这段代码吗
    ServiceList& sm = ServiceList::GetInstance();
    LoadBootScripts(am, sm); //这正是在解析 init.rc 文件，其中就包含 hw/init.rc
    
        2、可以认为 service 就是通过解析 init.rc 中的 service 获得的，此文件正好也导入 import hw/init.rc，其中包含 zygote 相关，
    进而继续解析 init.zygote.rc，zygote.rc 文件内容也会被解析到

ServiceList.GetInstance 就是 std::vector<std::unique_ptr<Service>> services_;
service->classenames() 就是 std::set<std::string> classnames_;
    
        3、创建 Service 的构造函数：
    Service::Service(const std::string& name, unsigned flags, uid_t uid, gid_t gid,
       const std::vector<gid_t>& supp_gids, int namespace_flags,
       const std::string& seclabel, Subcontext* subcontext_for_restart_commands,
       const std::vector<std::string>& args, bool from_apex)
       :  name_(name),
       classnames_({"default"}),
        ... etc
     ){}
    
    */

    for (const auto& service : ServiceList::GetInstance()) {
        //参数的来源
        /*
            1、反复查阅资料得知 args 就是 rc 文件中每个 service 的参数
        args[1] 自然是第二个参数
        看 hw/zygote.rc service 执行 zygote 命令前部分
        ...
        service zygote
          class main
          ...
        
            2、因此 args[1] 其实就是 main
        同样，我们看 hw/init.usb.rc 也有一个 service
        ...
        service adbd
           class core
           ...   
        adb 的使用与 adbd 可有很大的关系，adbd 是一个远程服务进程
        
            3、所以这里的意思是：
        根据参数名称去服务列表中查找是否存在，如果服务存在那么开始执行
        服务一般是以进程的形式存在，且很有可能是守护进程
        */
        if (service->classnames().count(args[1])) {
            if (auto result = service->StartIfNotDisabled(); !result.ok()) {
                LOG(ERROR) << "Could not start service '" << service->name()
                           << "' as part of class '" << args[1] << "': " << result.error();
            }
        }
    }
    return {};
}

//service.cpp
Result<void> Service::StartIfNotDisabled() {
    if (!(flags_ & SVC_DISABLED)) {
        return Start();
    } else {
        flags_ |= SVC_DISABLED_START;
    }
    return {};
}

//service.cpp
Result<void> Service::Start() {
    
    pid_t pid = -1;
    if (namespaces_.flags) {
        pid = clone(nullptr, nullptr, namespaces_.flags | SIGCHLD, nullptr);
    } else {
        //就这？进程就被 fork 出来了？？？
        pid = fork();
    }

    // pid 0 是 idle 进程，肯定不能
    if (pid == 0) {
        umask(077);
        RunService(override_mount_namespace, descriptors, std::move(pipefd));
        _exit(127);
    }
    
    //创建进程组
    errno = -createProcessGroup(proc_attr_.uid, pid_, use_memcg);
}
```

到此，通过查找服务列表创建了一堆进程，现在我们主要关注 `zygote`进程的创建，这时候间从 cpp 进入 Java

# 初始化 zygote
## 预加载配置

```cpp
//ZygoteInit.java
public class ZygoteInit {
    /*
     * 初始化主要做：
     * 1、完成预初始化
     * 2、创建 zygote 服务
     * 3、创建系统服务
     */
    public static void main(String[] argv) {
        //【1】完成预初始化
        /*
            1、调用 ZygoteHooks.onBeginPreload(); ZygoteHooks 从 Dalvik 包引入，在 framework 下没有找到的源码应该是在别处了，预想是对 Dalvik 的初始化；预加载结束时也会调用 ZygoteHooks.onEndPreload();
            2、VMRuntime 为 Dalvik 预加载路径下的类 /system/etc/preloaded-classes、profilebootclasspath
            3、创建并缓存非启动类路径下的类加载器 /system/framework/android.hidl.base-V1.0-java.jar、/system/framework/android.hidl.manager-V1.0-java.jar (HIDL 接口定义语言 —— https://source.android.google.cn/devices/architecture/hidl?hl=zh-cn)
            4、加载资源，加载前先更新配置（比如当前设备分辨率、屏幕尺寸、语言），
        根据分辨率加载 drawable、颜色资源
            5、通过 native 加载为应用进程准备的 HAL 硬件抽象列表
            6、如果开启了 ro.zygote.disable_gl_preload，也通过 native 执行图形 GL 预加载
            7、通过 System.loadLibrary 加载共享库 android.lib、compiler_rt.lib、jnigraphics.lib
            8、准备 Hyphenator 环境，缓存字体
            9、加载 webviewchromium_loader.lib，准备 webview 
            10、通过 AndroidKeyStoreProvider 安装 keystore 内容提供者  
        */
        preload(bootTimingsTraceLog);
        
        //初始化 GC，并执行一次清理
        ZygoteHooks.gcAndFinalize()；
        //到这里 zygote 已经是【初始化完毕】
        Zygote.initNativeState(isPrimaryZygote)
        
        //【2】创建 zygote 服务
        ZygoteServer zygoteServer = null;
        zygoteServer = new ZygoteServer(isPrimaryZygote);
        
        //【3】创建系统服务
        if (startSystemServer) {
            //fork，可见每一个系统服务都是独立的进程；ABI —— Application binary interface【参考链接】
            //在 Android 项目中对应的就是 ndk filter，如 arm64、x86  .etc
            //为支持不同平台，ndk filter 是能够配置多个的，所以是一个列表形式存在
            Runnable r = forkSystemServer(abiList, zygoteSocketName, zygoteServer);
            if (r != null) {
                //创建之后马上运行
                return;
            }
         }
         
        // zygote 服务进入自己的世界轮训
        caller = zygoteServer.runSelectLoop(abiList);
        if(caller != null){
            caller.run();
        }
    }
}
```

## 创建 zygoteServer

服务主要还是通过 socket 实现，等待来自 Linux、unix 守护进程 (socket) 的消息，同时也负责子进程的创建。

```cpp
//ZygoteServer.java
class ZygoteServer {

//列举几个重要的成员
//用于监听 socket 连接
private LocalServerSocket mZygoteSocket;
//为 USAP 非专用应用进程池 服务
private final LocalServerSocket mUsapPoolSocket;

ZygoteServer(boolean isPrimaryZygote) {
        //通过 native 调用获取
        mUsapPoolEventFD = Zygote.getUsapPoolEventFD();
        
        //主 zygote
        if (isPrimaryZygote) {
            //完成的 socket 名称需要和 ANDROID_SOCKET_ + socketname 拼接，
            //然后拿完整的名称去系统环境变量中查找获取文件描述符 fd —— file describe，实际是一个整型数值【参考链接】
            mZygoteSocket = Zygote.createManagedSocketFromInitSocket(Zygote.PRIMARY_SOCKET_NAME);
            mUsapPoolSocket =
                    Zygote.createManagedSocketFromInitSocket(
                            Zygote.USAP_POOL_PRIMARY_SOCKET_NAME);
        } else { //辅 zygote
            mZygoteSocket = Zygote.createManagedSocketFromInitSocket(Zygote.SECONDARY_SOCKET_NAME);
            mUsapPoolSocket =
                    Zygote.createManagedSocketFromInitSocket(
                            Zygote.USAP_POOL_SECONDARY_SOCKET_NAME);
        }

        //获取 非专用应用进程池 配置，还是通过系统配置 SystemPropertice 获取
        /*
            mUsapPoolSizeMax —— usap_pool_size_max
            mUsapPoolSizeMin —— usap_pool_size_min
            mUsapPoolRefillThreshold —— usap_refill_threshold
        */
        fetchUsapPoolPolicyProps();
    }
}

//最重要的还是进入 poll 轮训【关于高并发 IO 多路复用，参考链接】
Runnable runSelectLoop(String abiList) {

    while(true){
        //每一次轮训且超过一分钟都更新 USAP 配置
        fetchUsapPoolPolicyPropsWithMinInterval

        //系统调用 poll 处理文件描述符 fd
        //Os.poll 返回值0：表示处理超时或非阻塞状态没有可处理的文件描述符
        pollReturnValue = Os.poll(pollFDs, pollTimeoutMs);
        
        ... etc
        
        //还有一个需要关注的就是返回值，类型是 Runnable
        //这是在特殊情况下发生重置 USAP，command 的内容是：
        /*
            fetchUsapPoolPolicyPropsIfUnfetched();
            ZygoteHooks.preFork();
            ZygoteHooks.postForkCommon();
        */
        final Runnable command = fillUsapPool(sessionSocketRawFDs, isPriorityRefill);
        if (command != null) {
            return command;
        }
}
```

## 创建 SystemServer

```cpp
//ZygoteInit.java

/*
    abiList —— ndl filter
    socketname —— zygote 进程名称
    zygoteServer —— 自然是 zygote 的主要服务
*/
private static Runnable forkSystemServer(String abiList, String socketName,
                                             ZygoteServer zygoteServer) {
    //启动参数
    String[] args = {
                "--setuid=1000", //linux 中不同 uid 可以代表拥有不同的权限
                "--setgid=1000",
                "--setgroups=1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1018,1021,1023,"
                        + "1024,1032,1065,3001,3002,3003,3005,3006,3007,3009,3010,3011,3012",
                "--capabilities=" + capabilities + "," + capabilities,
                "--nice-name=system_server",
                "--runtime-args",
                "--target-sdk-version=" + VMRuntime.SDK_VERSION_CUR_DEVELOPMENT,
                "com.android.server.SystemServer",
     };
     

    //省略参数构造过程
    ZygoteArguments parsedArgs;
    
    //创建服务进程，还是调用 native 方法
    /*
        int pid = nativeForkSystemServer(
        uid, gid, gids, runtimeFlags, rlimits,
        permittedCapabilities, effectiveCapabilities);
    */
    pid = Zygote.forkSystemServer(
        parsedArgs.mUid, parsedArgs.mGid,
        parsedArgs.mGids,
        parsedArgs.mRuntimeFlags,
        null,
        parsedArgs.mPermittedCapabilities,
        parsedArgs.mEffectiveCapabilities);
     
    /*
        pid=0 则是子进程被创建
        pid=-1 则表示出错
        pid (非0值)创建父进程
    */
    if (pid == 0) {
        //？？？还会有第二个 zygote 进程，这是什么操作？？？
        //看看官方描述：We determine this by comparing the device ABI list with this zygotes list. 
        //            If this zygote supports all ABIs this device supports, there won't be another zygote.
        if (hasSecondZygote(abiList)) {
            waitForSecondaryZygote(socketName);
        }

        zygoteServer.closeServerSocket();
        //继续把参数分发给系统服务进程，这里做的事情比较多了
        /*
            1、获取系统服务类路径 systemServerClassPath，首先还是从系统环境中读取Os.getenv("SYSTEMSERVERCLASSPATH")；当进程执行时 ART 将会处理此路径
            2、负责 zygote 的 native 初始化和 application 的执行
            3、这里无论先走那个分支，后面都会走到同一个方法调用：return RuntimeInit.applicationInit(targetSdkVersion, disabledCompatChanges, argv,
        classLoader);
        
            if (parsedArgs.mInvokeWith != null) {
                WrapperInit.execApplication(parsedArgs.mInvokeWith,
                        parsedArgs.mNiceName, parsedArgs.mTargetSdkVersion,
                        VMRuntime.getCurrentInstructionSet(), null, args);
            } else {
                ClassLoader cl = getOrCreateSystemServerClassLoader();
                return ZygoteInit.zygoteInit(parsedArgs.mTargetSdkVersion,
                parsedArgs.mDisabledCompatChanges,
                parsedArgs.mRemainingArgs, cl);
            }
        */
        return handleSystemServerProcess(parsedArgs);
    }
}
```

```cpp
//RuntimeInit.java
protected static Runnable applicationInit(int targetSdkVersion, long[] disabledCompatChanges,
        String[] argv, ClassLoader classLoader) {

    //设置运行目标版本
    VMRuntime.getRuntime().setTargetSdkVersion(targetSdkVersion);
    //通过启动类名找到此类，由类加载器加载并调用其 main 方法
    return findStaticMain(args.startClass, args.startArgs, classLoader);
}
```

```cpp
//RuntimeInit.java
protected static Runnable findStaticMain(String className, String[] argv,
            ClassLoader classLoader) {
  
    //常规方法，只是执行 classloader
    Class<?> cl = Class.forName(className, true, classLoader);
    Method m = cl.getMethod("main", new Class[] { String[].class });
    
        //因为当前是在 zygote 进程创建 SystemServer，在此流程中本次执行我们认为参数 className="com.android.internal.os.SystemServer"
    return new MethodAndArgsCaller(m, argv);
}
```

到这里 SystemServer 已经创建完成，接下来是通过 `MethodAndArgsCaller` 方法执行其中的 `main` 方法，源码路径是`/frameworks/base/services/java/com/android/server/SystemServer.java`。

**那么本节笔记到此，我们下周再见😊。**

# 附加

## 参考链接

- Androi.bp：bp 文件，替换 .mk 的配置文，由 https://github.com/palantir/blueprint 框架解析
- Android.mk：mk 文件，Android 程序编译
- lmkd：low memory killer deamon 低内存终止守护进程
- Apex：Android pony express 解决较低级别系统模块的安装流程 https://source.android.google.cn/devices/tech/ota/apex?hl=zh-cn
- syspro 文件：系统共享信息的属性配置文件，通常作为系统 API 实现 https://source.android.google.cn/devices/architecture/sysprops-apis?hl=zh-cn#:~:text=一个,Sysprop%20说明文件包含一条属性消息，用来描述一组属性%E3%80%82
- ABI：与 CPU 指令集相关 https://developer.android.google.cn/ndk/guides/abis?hl=zh-cn
- fd ：文件描述符 https://www.cnblogs.com/cscshi/p/15705033.html
- Linux IO 多路复用：select、poll、epoll https://cloud.tencent.com/developer/article/1005481
- MTE：memory tagging extension  [ 内存标签扩展 ](https://cloud.tencent.com/developer/article/2003341#:~:text=Arm%20MTE（内存标记）作为Armv8.5指令集的一部分引入%E3%80%82%20MTE现在内置于Arm%20最近宣布的符合Armv9%20的%20CPU%20中，例如,Cortex-X2、Cortex-A710%20和Cortex-A510%E3%80%82%20未来基于Armv9%20的%20CPU%20也将集成%20MTE%E3%80%82)
- 已加标记指针：https://source.android.google.cn/devices/tech/debug/tagged-pointers?hl=zh-cn

