---
title: Android 系统 Systemserver
catalog: true
date: 2022-09-29 22:57:13
subtitle: 启动服务、核心服务、其他服务
header-img: /img/220928/android_sysserver_bg.png
tags: AOSP
sticky: 6
categories:
---


> Read The Fucking Source Code. `—— Linus` \
> \
> 站在'巨人'的肩膀上开始自己的旅途。`—— 佚名` \
> \
> 愉快的周末，从打开💻开始，到骑行归来结束。`—— 佚名`


![WechatIMG109.jpeg](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/844d2ca02d1a42269894c46eda4ef269~tplv-k3u1fbpfcp-watermark.image?)


> 文章系列 

`注：` 本系列文章源码基于 `Android 11-r21 master 分支`

- [ Android 系统启动 <init\> 进程 [1]](https://juejin.cn/post/7121229897074212877)
- [ Android 系统启动 <zygote\> 进程 [2]](https://juejin.cn/post/7123511970871345159)
- [Android 系统启动 <Systemserver\> 服务 [3]](https://juejin.cn/post/7125453300660437029) 
- [ Android 源码 \<package> 了解 [4]](https://juejin.cn/post/7126437054002495495)
- 🤔 敬请期待

> 相关文件

- /framework/base/service/java/com/android/server/SystemServer.java
- /framework/base/service/java/com/android/server/SystemServiceManager.java
- /framework/base/service/java/com/android/server/WatchDog.java
- /frameworks/base/core/java/com/android/server/SystemConfig.java
- ... etc

# 执行 System server

经过前两篇的系统文章，已经完成了 init、zygote 进程的创建和初始化，即将启动系统各大服务，各项服务由服务管理者 `System server` 完成创建和启动，那么赶紧进入瞧瞧去`/framework/base/service/java/com/android/server/SystemServer.java`

```java
//SystemServer.java
public final class SystemServer implements Dumpable {

    //列举几个认为重要的成员
    
   //类似这样的服务名称不少于 50 个
    private static final String WIFI_SERVICE_CLASS =
            "com.android.server.wifi.WifiService";                  //Wi-Fi服务
    private static final String WIFI_SCANNING_SERVICE_CLASS =
            "com.android.server.wifi.scanner.WifiScanningService";  //Wi-Fi 扫描
    private static final String ALARM_MANAGER_SERVICE_CLASS =
            "com.android.server.alarm.AlarmManagerService";         //闹钟
    ... etc
    
    //系统默认的对话框等主题
    private static final int DEFAULT_SYSTEM_THEME =
           com.android.internal.R.style.Theme_DeviceDefault_System;
    
    //很重要的一个主角，系统服务管理者
    private SystemServiceManager mSystemServiceManager;

    //具体服务实现类
    private ActivityManagerService mActivityManagerService;  //Activity 管理
    private PackageManagerService mPackageManagerService;    //安装包管理
    private ContentResolver mContentResolver;                //内容解析——内容提供者数据解析
    private DisplayManagerService mDisplayManagerService;    //设备显示相关

    //看变量名就很清晰，application 错误报告信息记录
    private static LinkedList<Pair<String, ApplicationErrorReport.CrashInfo>> sPendingWtfs;

    //memtracker：memory tracker 【参考链接】
    private static native void startMemtrackProxyService();

    //Hidl Hardware Interface Definition Language 硬件抽象层语言【参考链接】
    private static native void startHidlServices();

    //调试模式下我们应用进程能够 dump head，dump file 是进程的内存镜像，把进程当前保存的状态保存到 dump 文件
    //head dump 其实利用 Android studio 内置的工具（Android profile、Memory profile）也是可以生成的，直接帮你把文件可视化
    //生成的文件保存路径 /data/system/heapdump/
    private static native void initZygoteChildHeapProfiling();


    //从主函数开始执行
    public static void main(String[] args) {
        new SystemServer().run();
    }
}
```


```java
//SystemServer
public SystemServer() {
    //记录性信息，不影响继续阅读吧，主要还是后面的 run 方法

    mFactoryTestMode = FactoryTest.getMode();
    mStartCount = SystemProperties.getInt(SYSPROP_START_COUNT, 0) + 1;
    mRuntimeStartElapsedTime = SystemClock.elapsedRealtime();
    mRuntimeStartUptime = SystemClock.uptimeMillis();
    Process.setStartTimes(mRuntimeStartElapsedTime, mRuntimeStartUptime);

    mRuntimeRestart = "1".equals(SystemProperties.get("sys.boot_completed"));
}
```

```java
//SystemServer.java
private void run() {

    //通过设置系统属性，记录进程启动信息，启动次数等
    SystemProperties.set(SYSPROP_START_COUNT,String.valueOf(mStartCount));
    //如果当前时区无效将被设置为默认值 GMT —— 格林威治时间
    SystemProperties.set("persist.sys.timezone", "GMT");
    //如果知道了语言，尝试通过语言设置地区属性
    //【presist 前缀的系统属性是可写的，ro 前缀的系统属性是只读的】
    if (!SystemProperties.get("persist.sys.language").isEmpty()) {
        final String languageTag = Locale.getDefault().toLanguageTag();
        SystemProperties.set("persist.sys.locale", languageTag); 
    }
    
    /*前面都是在设置一些系统属性，接下来将要真正启动服务*/
    
    //SystemClock.elapsedRealtime();  获取设备启动到当前的毫秒值
    //清理一次内存，为 application 可以分配得到更多内存
    VMRuntime.getRuntime().clearGrowthLimit();

    //启动准备线程策略 THREAD_PRIORITY_FOREGROUND：应用程序不得更改线程优先级、不得更改线程数量，这些将由系统自动调整
    android.os.Process.setThreadPriority(
        android.os.Process.THREAD_PRIORITY_FOREGROUND); 
    //这是对前一条语句设置前台进程的限制 THREAD_PRIORITY_FOREGROUND，这里传入 false，如果此前设置的线程策略是‘后台进程组’将抛出异常
    android.os.Process.setCanSelfBackground(false);

    //Looper 是线程的消息循环机制，这里的线程自然是执行的主线程 Main-Thread，也就是 application 所在线程
    //这里有一个经典八股文😊：自定义子线程 Looper 需要手动执行 prepareLooper，为什么我们在使用主线程的 Looper 前不需要先调用 prepare Looper？
    //       A答：调用时肯定要调用的。这不是废话吗，我们不调用那肯定是‘别人’已经在我们使用前就调用了————那这个‘别人’其实就是 Android env 在创建时候调用了
    //这个 application main loop 被系统缓存在 Looper.java 中（static final ThreadLocal<Looper> sThreadLocal = new ThreadLocal<Looper>();）
    //我们平时使用是通过： Looper.getMainLooper()
    Looper.prepareMainLooper();
    Looper.getMainLooper().setSlowLogThresholdMs(
        SLOW_DISPATCH_THRESHOLD_MS, SLOW_DELIVERY_THRESHOLD_MS);

    //创建系统上下文 mSystemContext 以及设置上述的默认主题
    createSystemContext();
    //继续
    mSystemServiceManager = new SystemServiceManager(mSystemContext);

    //启动读取系统全局配置的线程池，下面启动服务启动时候将会用到
    //什么时候关闭线程池呢？if (phase == SystemService.PHASE_BOOT_COMPLETED){SystemServerInitThreadPool.shutdown();}
    SystemServerInitThreadPool tp = SystemServerInitThreadPool.start();

    //【重点、重点、重点】
    //启动各种 Service
    startBootstrapServices(t);  //启动服务
    startCoreServices(t);       //核心服务
    startOtherServices(t);      //其他服务
    
    //一个检测工具
    StrictMode.initVmDefaults(null);
    //进入一个无眠的世界默默`打工`，为‘人民’服务
    /*
        1、获得当前线程的消息队列 MessageQueue
        2、在 for(;;) 循环中不断从消息队列取出消息，queue.next()，这是一个阻塞的过程
        3、如果获取到可用的消息则进行分发 msg.target.dispatchMessage(msg)
        4、消息分发之后进行回收或清理 msg.recycleUnChecked()
    */
    Looper.loop();
}
```

# 启动 Bootstrap 服务
```java
//SystemServer.java
private void startBootstrapServices(@NonNull TimingsTraceAndSlog t) {

    //【1】watchdog 看门🐶？看着是有这个意思，大概就是监控服务
    /*
        1、它运行在一个单独的线程中 mThread = new Thread(this::run, "watchdog");
        2、主要是检查一些线程的运行状态和调度情况，比如检查的线程有前台线程、IO、UI、main、display、animation、surface animation 等线程
    */
    final Watchdog watchdog = Watchdog.getInstance();
    watchdog.start();

    //【2】加载全局系统配置信息
    /*
        1、此线程池在 SystemServer 启动时候执行
        2、在 SystemServer 启动完成之后关闭 SystemService.PHASE_BOOT_COMPLETE
        3、调用 submit 方法真正执行系统全局配置读取的方法在哪里？线程池提交之后执行的当然是 run 方法。谁的 run 方法？SystemConfig::getInstance 又是啥，在哪里？【不解，知者欢迎评论】
        4、SystemConfig::getInstance：Java 能够使用双引号访问静态方法，在此之前我只知道 cpp 是可以这样的，后来查了一下似乎是 lambada 的语法糖😺不知者无罪
        5、readPublicNativeLibrariesList();//String[] dirs = {"/system/etc", "/system_ext/etc", "/product/etc","vendor/etc"};读取此目录下 public.libraries- 开头，.txt 结尾的配置文件
        6、readAllPermissions();//解析根目录、Vendor目录等 etc/sysconfig、etc/permission 下 XML 权限文件
    */
    final String TAG_SYSTEM_CONFIG = "ReadingSystemConfig";
    SystemServerInitThreadPool.submit(SystemConfig::getInstance, TAG_SYSTEM_CONFIG);

    //【3】公共服务
    /*
        1、将来 ActivityManagerService、PackageManagerService ...etc 会使用
        2、调用 addService 一看流程最终到了 IServiceManager.cpp 藏得这么深，真是服了这个老 six，sp<AidlServiceManager> mTheRealServiceManager;   
    */
    PlatformCompat platformCompat = new PlatformCompat(mSystemContext);
    ServiceManager.addService(Context.PLATFORM_COMPAT_SERVICE, platformCompat);
    ServiceManager.addService(Context.PLATFORM_COMPAT_NATIVE_SERVICE,
        new PlatformCompatNative(platformCompat));

    //【4】文件完整性校验相关服务
    mSystemServiceManager.startService(FileIntegrityService.class);

    //【5】应用程序安装相关服务
    Installer installer = mSystemServiceManager.startService(Installer.class);

    //【6】设备标识访问策略服务
    /*
        1、获取手机序列号：getSerial()，系统属性对应键 ro.serialn。调用时
elephonyPermissions.checkCallingOrSelfReadDeviceIdentifiers
        2、指定包名获取序列号 getSerialForPackage，其中再根据包名 + 当前用户ID获取调用此类的 UID，所以猜测还有有不少限制的，比如限制非 root 用户、限制非系统应用
    */
    SystemServiceManager.startService(DeviceIdentifiersPolicyService.class);
    
    //【7】URI 授权管理服务 （关于 Uri 可参考链接）
    mSystemServiceManager.startService(UriGrantsManagerService.Lifecycle.class);
    
    //【8】电池相关服务
    /*
        1、电量🔋触发器BatteryTrigger mBatteryTrigger，通过广播监听电量变化，当电量下降1%将会接收到广播，似乎只做一件事：就是更新最新电量信息
        2、IntentFilter filter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED); 通过 context 注册广播
    */
    mSystemServiceManager.startService(PowerStatsService.class);

    //【9】内存分析服务  （native 调用）
    startMemtrackProxyService();
    
    //【10】AMS 服务（终于看到一个比较常见的🐶）
    /*
        1、高版本任务栈管理类似乎被分离出来了，由 ActivityTaskManagerService 实现，内容太多，下次一定看看
    */
    ActivityTaskManagerService atm = mSystemServiceManager.startService(
        ActivityTaskManagerService.Lifecycle.class).getService();
    mActivityManagerService = ActivityManagerService.Lifecycle.startService(
        mSystemServiceManager, atm);

    //【11】数据加载
    mDataLoaderManagerService = mSystemServiceManager.startService(
        DataLoaderManagerService.class);
        
    //【12】电源管理服务，之前那个时电池状态管理（只做了一件事：监听电量变化）
    mPowerManagerService = mSystemServiceManager.startService(PowerManagerService.class);

    //【13】系统恢复服务，我们刷机常见的 Recover 模式
    mSystemServiceManager.startService(RecoverySystemService.Lifecycle.class);

    //【14】安装包管理服务，这是个大类，三万行呢，下次一定看看
    mPackageManagerService = PackageManagerService.main(mSystemContext, installer,
        domainVerificationService, mFactoryTestMode != FactoryTest.FACTORY_TEST_OFF,
        mOnlyCore);
        
    //【15】传感器服务
    mSystemServiceManager.startService(new SensorPrivacyService(mSystemContext));
    mSystemServiceManager.startService(SensorService.class);
}
```
启动服务到这里就结束啦，只是部分列举，并不完整，服务是如何运行的？具体都在做了些什么？等等！！！

这些执行细节希望在之后的系列文章进一步深入（内容实在是太多了😭）

# 启动 Core 服务
```java
//SystemServer.java
private void startCoreServices(@NonNull TimingsTraceAndSlog t) {
    //【1】主要负责读取系统配置信息
    mSystemServiceManager.startService(SystemConfigService.class);
    
    //【2】电量跟踪
    mSystemServiceManager.startService(BatteryService.class);
    
    //【3】应用使用状态跟踪
    mSystemServiceManager.startService(UsageStatsService.class);
    
    //【4】监控设备是否充电、屏幕是否亮起
    //（通过高优先级的广播监听📢，指定特定的 intentfilter——ACTION_SCREEN_ON/ACTION_SCREEN_OFF/ACTION_BATTERY_CHANGED）
    mSystemServiceManager.startService(CachedDeviceStateService.class);
    
    //【5】应用程序回滚？？？
    mSystemServiceManager.startService(ROLLBACK_MANAGER_SERVICE_CLASS);

    //【6】tombstone 墓碑，记录进程被杀死前的一些信息，比如调用栈、内存使用情况、CPU 使用情况、backtrace 等等，主要是监控和记录 native 崩溃信息（获取这个崩溃日志需要 root 权限）
    mSystemServiceManager.startService(NativeTombstoneManagerService.class);
    
    //【7】Android 错误报告生成，应用崩溃时候查看这个报告还是很有用的（前提是你能够看懂报告）
    // 可以同 adb bugreport 获取错误报告（Android 版本之间获取方式稍有区别，根据 adb bugreport 提示操作即可）
    mSystemServiceManager.startService(BugreportManagerService.class);

    //【8】主要还是监视和收集 GPU 信息
    mSystemServiceManager.startService(GpuService.class);    
}
```
核心服务不是很多，主要是信息记录相关，必不可少、确实很是关键。

# 启动 Other 服务
```java
//SystemServer.java
 private void startOtherServices(@NonNull TimingsTraceAndSlog t) {

        try {
            //闹钟服务⏰
            mSystemServiceManager.startService(ALARM_MANAGER_SERVICE_CLASS);
            //WMS 服务
            mSystemServiceManager.startBootPhase(t, SystemService.PHASE_WAIT_FOR_SENSOR_SERVICE);
            wm = WindowManagerService.main(context, inputManager, !mFirstBoot, mOnlyCore,
                    new PhoneWindowManager(), mActivityManagerService.mActivityTaskManager);
            ServiceManager.addService(Context.WINDOW_SERVICE, wm, /* allowIsolated= */ false,
                    DUMP_FLAG_PRIORITY_CRITICAL | DUMP_FLAG_PROTO);
            ServiceManager.addService(Context.INPUT_SERVICE, inputManager,
                    /* allowIsolated= */ false, DUMP_FLAG_PRIORITY_CRITICAL);

            //蓝牙服务
            if (mFactoryTestMode == FactoryTest.FACTORY_TEST_LOW_LEVEL) {
                Slog.i(TAG, "No Bluetooth Service (factory test)");
            } else if (!context.getPackageManager().hasSystemFeature
                    (PackageManager.FEATURE_BLUETOOTH)) {
                Slog.i(TAG, "No Bluetooth Service (Bluetooth Hardware Not Present)");
            } else {
                mSystemServiceManager.startService(BluetoothService.class);
            }

            //网络列表监控服务
            mSystemServiceManager.startService(NetworkWatchlistService.Lifecycle.class);

            //输入法管理服务
            if (InputMethodSystemProperty.MULTI_CLIENT_IME_ENABLED) {
                mSystemServiceManager.startService(
                        MultiClientInputMethodManagerService.Lifecycle.class);
            } else {
                mSystemServiceManager.startService(InputMethodManagerService.Lifecycle.class);
            }
            
            //辅助功能
            try {
                mSystemServiceManager.startService(ACCESSIBILITY_MANAGER_SERVICE_CLASS);
            } catch (Throwable e) {
                reportWtf("starting Accessibility Manager", e);
            }
            
            //开发者选项中，OEM 解锁还记得吗
            if (hasPdb || OemLockService.isHalPresent()) {
                mSystemServiceManager.startService(OemLockService.class);
            }

            //状态栏    
            try {
                statusBar = new StatusBarManagerService(context);
                ServiceManager.addService(Context.STATUS_BAR_SERVICE, statusBar);
             } catch (Throwable e) {
             }
             


            startContentCaptureService(context, t);
            startAttentionService(context, t);
            startRotationResolverService(context, t);
            startSystemCaptionsManagerService(context, t);
            //文字语音转换
            startTextToSpeechManagerService(context, t);

            //系统语音识别
            mSystemServiceManager.startService(SPEECH_RECOGNITION_MANAGER_SERVICE_CLASS);
            
            //智慧空间？记得华为手机搜索页面是这个名称，有的叫‘智慧场景’
            mSystemServiceManager.startService(SMARTSPACE_MANAGER_SERVICE_CLASS);

            //网络
            try {
                networkManagement = NetworkManagementService.create(context);
                ServiceManager.addService(Context.NETWORKMANAGEMENT_SERVICE, networkManagement);
            } catch (Throwable e) {
            }
            
            //字体
            mSystemServiceManager.startService(new FontManagerService.Lifecycle(context, safeMode));

            //Wi-Fi
            if (context.getPackageManager().hasSystemFeature(
                    PackageManager.FEATURE_WIFI)) {
                mSystemServiceManager.startServiceFromJar(
                        WIFI_SERVICE_CLASS, WIFI_APEX_SERVICE_JAR_PATH);
                mSystemServiceManager.startServiceFromJar(
                        WIFI_SCANNING_SERVICE_CLASS, WIFI_APEX_SERVICE_JAR_PATH);
            }
            if (context.getPackageManager().hasSystemFeature(
                    PackageManager.FEATURE_WIFI_RTT)) {
                mSystemServiceManager.startServiceFromJar(
                        WIFI_RTT_SERVICE_CLASS, WIFI_APEX_SERVICE_JAR_PATH);
            }
            if (context.getPackageManager().hasSystemFeature(
                    PackageManager.FEATURE_WIFI_AWARE)) {
                mSystemServiceManager.startServiceFromJar(
                        WIFI_AWARE_SERVICE_CLASS, WIFI_APEX_SERVICE_JAR_PATH);
            }
            if (context.getPackageManager().hasSystemFeature(
                    PackageManager.FEATURE_WIFI_DIRECT)) {
                mSystemServiceManager.startServiceFromJar(
                        WIFI_P2P_SERVICE_CLASS, WIFI_APEX_SERVICE_JAR_PATH);
            }
            
            //VPN
            try {
                vpnManager = VpnManagerService.create(context);
                ServiceManager.addService(Context.VPN_MANAGEMENT_SERVICE, vpnManager);
            } catch (Throwable e) {
            }
            t.traceEnd();

            t.traceBegin("StartVcnManagementService");
            try {
                vcnManagement = VcnManagementService.create(context);
                ServiceManager.addService(Context.VCN_MANAGEMENT_SERVICE, vcnManagement);
            } catch (Throwable e) {
                reportWtf("starting VCN Management Service", e);
            }
            t.traceEnd();

            //系统更新
            try {
                ServiceManager.addService(Context.SYSTEM_UPDATE_SERVICE,
                        new SystemUpdateManagerService(context));
            } catch (Throwable e) {
            }
            
            //通知栏
            mSystemServiceManager.startService(NotificationManagerService.class);
            SystemNotificationChannels.removeDeprecated(context);
            SystemNotificationChannels.createAll(context);
            notification = INotificationManager.Stub.asInterface(
                    ServiceManager.getService(Context.NOTIFICATION_SERVICE));

            //壁纸
            if (context.getResources().getBoolean(R.bool.config_enableWallpaperService)) {
                mSystemServiceManager.startService(WALLPAPER_SERVICE_CLASS);
            } else {
            }

            //音量
            if (!isArc) {
                mSystemServiceManager.startService(AudioService.Lifecycle.class);
            } else {
                String className = context.getResources()
                        .getString(R.string.config_deviceSpecificAudioService);
                try {
                    mSystemServiceManager.startService(className + "$Lifecycle");
                } catch (Throwable e) {
                }
            }
            
            //无限广播
            if (mPackageManager.hasSystemFeature(PackageManager.FEATURE_BROADCAST_RADIO)) {
                t.traceBegin("StartBroadcastRadioService");
                mSystemServiceManager.startService(BroadcastRadioService.class);
                t.traceEnd();
            }
        
            //adb 调试
            try {
                mSystemServiceManager.startService(ADB_SERVICE_CLASS);
            } catch (Throwable e) {
                Slog.e(TAG, "Failure starting AdbService");
            }
            
            //app 启动
        mSystemServiceManager.startService(LauncherAppsService.class);
            
            //启动密码锁
        mSystemServiceManager.startBootPhase(t, SystemService.PHASE_LOCK_SETTINGS_READY);
        
        //紧接着会有各项之前启动的服务调用 systemReady() 方法，指定服务准备完毕，即将进入下一个阶段
        mPackageManagerService.systemReady();
        mDisplayManagerService.systemReady(safeMode, mOnlyCore);
        ... etc
        
        //等待服务准备完毕
        mPackageManagerService.waitForAppDataPrepared();

        //各项服务调用 systemRunning()、start() 方法开始运行服务自身
        countryDetectorF.systemRunning();
        networkTimeUpdaterF.systemRunning();
        inputManagerF.systemRunning();
        telephonyRegistryF.systemRunning();
        mmsServiceF.systemRunning();
        ... etc
        
        //启动系统界面服务
        /*
            1、通过 intent 指定特定的组件 context.startServiceAsUser(intent, UserHandle.SYSTEM);
            2、startServiceAsUser 更上层的代码对我们看来像是调用 context.startService
            3、指定的启动的服务组件 pm.getSystemUiServiceComponent() 是什么呢？
                PackageManagerInternal pm = LocalServices.getService(PackageManagerInternal.class);
                PackageManagerInternal 是一个抽象类，实现类是 PackageManagerInternalImpl
                而 PackageManagerInternalImpl 是 PackageManager 的内部类，所属成员是 private final PackageManagerInternal mPmInternal;
                而 getSystemUiServiceComponent 就是获取一个 string 资源com.android.internal.R.string.config_systemUIServiceComponent
            4、资源文件所在路径：frameworks/base/core/res/res/values/config.xml【看这个文件有好多服务的 component】
            5、资源内容 
            <!-- SystemUi service component -->
            <string name="config_systemUIServiceComponent" translatable="false">com.android.systemui/com.android.systemui.SystemUIService</string>
        */
        startSystemUi(context, windowManagerF);
    }
}
```

## 启动 SystemUI 服务

```java
//SystemServer.java
private static void startSystemUi(Context context, WindowManagerService windowManager) {
    PackageManagerInternal pm = LocalServices.getService(PackageManagerInternal.class);
    Intent intent = new Intent();
    /*
        1、很明显这是一个服务 component: com.android.systemui/com.android.systemui.SystemUIService
        2、此服务 Java 实现类所在路径是 /framework/base/packages/SystemUI/src/com/android/systemui/SystemUIService.java
        3、这个类比较简洁，主要有三个成员分别负责不同的事情
            mainHandle  ：主线程通讯，明知故问
            dumpHandle  ：当前线程运行状态信息输出
            logBufferFreezer   ：负责错误报告日志相关【错误报告-参考链接】
            
        4、system server 进程启动的 UI 服务：来到了 SystemUIApplication.java 这个类 ((SystemUIApplication) getApplication()).startServicesIfNeeded();
            所有的 UI 服务包含哪些？服务名称列表哪里来？又是一个字符串数组资源 config_systemUIServiceComponents R.array.config_systemUIServiceComponentsPerUser
            资源所在路径是 /framework/base/packages/SystemUI/res/value/config.xml
            
            4.1【服务列表参考下文】
            4.2 通过反射创建服务 Class.forname(serviceName) 调用指定构造函数 newInstance
            4.3 启动服务 mServices[i].start(); 接下来就不具体看了，以后具体服务具体分析
            
        5、SysteUIApplication 他是一个 Application，所以在此之前创建该实例是会先执行 onCreate 方法，
            这里有调用一个重要的方法，对于非私有的非系统用户将执行 startSecondaryUserServicesIfNeeded();
            获取的服务列表是 R.array.config_systemUIServiceComponentsPerUser 查看只有一个服务
            
            5.1 com.android.systemui.util.NotificationChannels
            
    intent.setComponent(pm.getSystemUiServiceComponent());
    intent.addFlags(Intent.FLAG_DEBUG_TRIAGED_MISSING);
    context.startServiceAsUser(intent, UserHandle.SYSTEM);
    windowManager.onSystemUiStarted();
}
```

**system UI 服务列表**
```xml
//通知渠道服务（Android 低版本的通知创建是不需要设置通知渠道，后来高版本引入通知渠道并且必须设置，否则通知显示存在异常）
<item>com.android.systemui.util.NotificationChannels</item> 
<item>com.android.systemui.keyguard.KeyguardViewMediator</item> 
//应用最近任务列表
<item>com.android.systemui.recents.Recents</item> 
//音量
<item>com.android.systemui.volume.VolumeUI</item> 
<item>com.android.systemui.stackdivider.Divider</item> 
//状态栏
<item>com.android.systemui.statusbar.phone.StatusBar</item>
<item>com.android.systemui.usb.StorageNotification</item> 
<item>com.android.systemui.power.PowerUI</item> 
<item>com.android.systemui.media.RingtonePlayer</item> 
//键盘
<item>com.android.systemui.keyboard.KeyboardUI</item> 
<item>com.android.systemui.pip.PipUI</item> 
<item>com.android.systemui.shortcut.ShortcutKeyDispatcher</item> 
<item>@string/config_systemUIVendorServiceComponent</item> 
<item>com.android.systemui.util.leak.GarbageMonitor$Service</item> 
<item>com.android.systemui.LatencyTester</item> 
<item>com.android.systemui.globalactions.GlobalActionsComponent</item> <item>com.android.systemui.ScreenDecorations</item> 
<item>com.android.systemui.biometrics.AuthController</item> 
<item>com.android.systemui.SliceBroadcastRelayHandler</item> 
<item>com.android.systemui.SizeCompatModeActivityController</item> 
<item>com.android.systemui.statusbar.notification.InstantAppNotifier</item> 
<item>com.android.systemui.theme.ThemeOverlayController</item> 
<item>com.android.systemui.accessibility.WindowMagnification</item> 
<item>com.android.systemui.accessibility.SystemActions</item> 
<item>com.android.systemui.toast.ToastUI</item>
```

System Server 大概是启动完成，那么接下来又去哪里运行了呢？？？或者下一步我们继续看那个点比较合适呢？？？

之前我们只是粗略浏览，中间忽略了很多，下一步的入口点可能要返回之前的代码重新阅读发现合适的切入点，SystemServer 也已经进入了‘永久的循环’，等待的就是接受外部‘信号’做相应处理、继续分发到具体执行。 

> **那么，我们下周再见😊**

# 附加

## 如何快速搜索
**Android 项目中如何快速搜索某关键字？**

AOSP 整个项目是很庞大的，不仅仅是包含 java 代码，就拿当前我下载的 `Android 11-r21 分支`来说，我是通过 git 下载在没有指定 `single-branch dept=1` 参数下，整个过程下载完毕占用大约 **430G** 存储空间。

一开始我把源码存储在机械硬盘，通过 VSCode 打开机存在械硬盘的中的项目（整个 AOSP），比如搜索某个关键字，那个速度堪比龟速；后来把项目拷贝到笔记本 SSD 固态硬盘，搜索速度确实有了明显的提高，但整个项目搜索还是比较慢，不是十分满意；如果是单独打开某个模块——— framework 模块、framework base 模块等等，搜索速度还可以接受。但如果要找的代码根本不在当前模块，比如你打开 framework base 模块，但实际代码在 framework service 模块，这样是搜索不到结果的，因此还得把搜索范围扩大，引入的模块多了速度终是会变慢。

搜索能够快速找到目标，是不是要借助一个东西————**索引**，如果有工具把 AOSP 整个项目预先建立索引，然后再打开项目搜索，下次搜索时无需重新创建索引，通过索引搜索不得要起飞。~~与搜索相关索引确实是个好东西。~~


【**最后**】

推荐使用已有的在线网站辅助搜索：[**基于 opengrok 的 AOSPXRef**](http://aospxref.com)

以搜索 SystemUIService `config_systemUIServiceComponent`为例：
![image.png](https://p1-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/f6d6877806a144cfb2a73a40aa569c01~tplv-k3u1fbpfcp-watermark.image?)

【**最后的最后**】

ASOPXRef 现有的项目是较少的，也就是几个特定的版本，如果能满足自己的需求刚好，要是想看的源码版本不是已存在的建议还是自己通过 `opengrok` 引擎搭建一个服务。
**Oracle opengrok：**[快速且可用的源代码搜索和交叉引用引擎](https://github.com/oracle/opengrok)



## 参考链接
- WTF：What a Terrible Failure —— Android 系统错误记录的一种
- Memtrack：内存分析 https://zhuanlan.zhihu.com/p/168361476
- Hidl：硬件抽象层，在较低 Android 版本可能还在使用 HAL （hardware abstract layer）https://zhuanlan.zhihu.com/p/28256541
- Android Uri：https://www.cnblogs.com/bhlsheji/p/4246580.html
- Android 错误报告：https://developer.android.com/studio/debug/bug-report ，https://source.android.com/source/read-bug-reports.html
- Android 墓碑：https://source.android.com/devices/tech/debug

