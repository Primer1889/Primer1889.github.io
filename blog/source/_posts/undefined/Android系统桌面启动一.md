---
title: Android 系统 Home（一）
catalog: true
date: 2022-09-29 22:57:44
subtitle: 启动桌面就是查找并启动 Activity
header-img: /img/220928/android_sysserver_bg.png
tags: AOSP
sticky: 8
categories:
---


# Ready go
在系列文章中，上一章我们对 `package` 目录下的内容有了一定的了解，我们知道设备上的桌面其实就是一个`系统应用`，AOSP 原生有提供，但是厂商定制的 ROM 往往会自己重写或重新实现，扩展功能；那么继续 Android 系统启动思考往下走，我们是不是应该看看手机桌面是如何显示的———桌面程序是如何启动的？

虽然我们知道桌面程序是`Launcher`，但是我们作为刚阅读源码的小白，**如何在源码中快速找到桌面程序启动的入口？** 这是一个可以思考的问题， 当然，站在‘巨人的肩膀’直接使用百度也是可以的，但这里我想到另外一种方式————`无障碍服务 Accessebility`；在平时开发中，无障碍服务除了满足项目需求应用于项目中外，还有一种就是利用该服务作为我们的辅助工具，提高开发效率，我个人最常用的就是`查看系统当前最顶部显示的 activity`。作为辅助手段，早已有成熟的软件工具，这里推荐两个工具。


- 开发者助手
- Android 开发工具箱
- MT 文件管理器

# systemReady

我们知道，SystemServer 在被调用时先执行 `main` 函数，紧接着执行当前类的静态方法 `run`，然后分三个阶段启动 `启动服务、核心服务、其他服务`，最后进入 `Looper().loop` 循环忘不停歇的 ~~打工~~ 等待消息到来并处理。启动服务是一部分，难道不做点别的吗？刚好在启动 **其他服务** 这里看到这一段注释：

```
// We now tell the activity manager it is okay to run third party
// code.  It will call back into us once it has gotten to the state
// where third party code can really run (but before it has actually
// started launching the initial applications), for us to complete our
// initialization.

SystemServer：AMS 你所需的一些服务已准备就绪，可以启动第三方应用了，收到请回答，收到请回答，over！over！

AMS：收到！收到！看我回调行事，over！
```

先是 AMS systemReady 进入准备阶段

```java
//ActivityManagerService.java
public void systemReady(final Runnable goingCallback, @NonNull TimingsTraceAndSlog t) {

    /*
        1、管理 activity 的任务栈【这种内容太细了，以后逐个看看，先略过】
        2、包含 RecentTasks 最近运行的任务列表
    */
    mActivityTaskManager.onSystemReady();
    mUserController.onSystemReady();
    //访问控制，主要与权限、限制相关
    mAppOpsService.systemReady();
    mProcessList.onSystemReady();

    /*
        1、如果进程或进程组被标记为杀死，将调用 Process.killProcessQuiet(mPid);ProcessList.killProcessGroup(uid, mPid);杀死进程，为启动新进程做准备
        2、当然，进程也可能被标记为重启，便不会从进程队列中移除       
    */
    mProcessList.removeProcessLocked
    //注册启动监听，ATM：activitTaskManager
    mAtmInternal.getLaunchObserverRegistry().registerLaunchObserver(mActivityLaunchObserver);
    //UGM：uri global manager，uri 作为数据访问地址、数据传递也是很常用的
    mUgmInternal.onSystemReady();
    //pmi：power manager internal，低电量监控
    pmi.registerLowPowerModeObserver
    
    
    //😓执行到一半就返回去执行回调【请参考 —— 回调1】
    if (goingCallback != null) goingCallback.run();
        
    /*
        1、启动持久应用（不会休眠的、启动唤醒程序），待启动的是哪些应用，又来到了 IPackageManager.aidl 的 getPersistentApplications，
           实现类是 PackageManagerService.java
        2、getPersistentApplications 实际上获取到的是一个 ApplicationInfo 列表
        3、通过 applicationInfo 创建 processRecorder，接着通过 ProcessList 一顿判断、调整 processRecorder
        4、最后可能通过 wzygote 或 Process.start 启动
    */
    startPersistentApps(PackageManager.MATCH_DIRECT_BOOT_AWARE);

    //ActivityTaskManagerInternal.java 实现类在 ActivityManagerService 的一个内部类 LocalService；
    //‼️启动桌面程序
    mAtmInternal.startHomeOnAllDisplays(currentUserId, "systemReady");
    
    mAtmInternal.resumeTopActivities(false /* scheduleIdle */);    
}
```

AMS 准备完毕，请求 SystemServer 超级管家执行回调

```java
//SystemServer.java 【回调1】
mActivityManagerService.systemReady(() -> {

    //service.onBootPhase(mCurrentPhase=500); 系统服务那么多到底谁在执行 500 这个标记？
    //不用过多关注，这只是一个通知，回调告知其他服务 AMS 启动了，你们可以使用 AMS 做别的事情
    mSystemServiceManager.startBootPhase(t, SystemService.PHASE_ACTIVITY_MANAGER_READY);
    
    //AMS 需要监控 native 崩溃，里面启动了一个线程 Thread，内部使用阻塞的 socket 接收崩溃信息并返回给上层或输出
    mActivityManagerService.startObservingNativeCrashes();

    //看到 ops 往往是跟限制策略有关🚫
    mActivityManagerService.setAppOpsPolicy(new AppOpsPolicy(mSystemContext));

    // Wait for all packages to be prepared
    mPackageManagerService.waitForAppDataPrepared();
    //第三方应用准备好了，又发起一个启动第三方应用的回调，让各自实现此状态码的服务执行相应操作【见图1】
    mSystemServiceManager.startBootPhase(t, SystemService.PHASE_THIRD_PARTY_APPS_CAN_START);

    ... etc
    
    //到这里我们算是回调执行完成，我们又要回到 systemReady 里面去，继续看执行 goingCallback.run(); 之后的代码
    
}, t);
```

# startHomeOnAllDisplays

我们想知道 startHomeOnAllDisplays 的具体实现在哪里？有谁执行的？不妨找找看。

- ActivityManagerService#mAtmInternal.startHomeOnAllDisplays(currentUserId, "systemReady"); `AMS 中调用`
- ActivityTaskManagerInternal#startHomeOnAllDisplays   `这是一个抽象类的抽象方法`
- ActivityTaskManagerService#LocalService            `实现类是 ATMS 的内部类`
- ActivityTaskManagerService#mInternal; `实现类实例赋给了 ATMS 的成员`
- ActivityTaskManagerService#LocalServices.addService(ActivityTaskManagerInternal.class, mInternal); `在 ATMS 启动周期 onStart 中被缓存到本地服务列表`
- com.android.server#private static final ArrayMap<Class<?>, Object> sLocalServiceObjects `本地服务列表就是这么一个简单的数组`
- ActivityTaskManagerService#mAtmInternal = LocalServices.getService(ActivityTaskManagerInternal.class); `从本地服务缓存列表中获取实例赋给 ATMS`

了解了，直接找实现类 `LocalService`。

```java
//ActivityTaskManagerService.java#LocalService
@Override
public boolean startHomeOnAllDisplays(int userId, String reason) {
    synchronized (mGlobalLock) {
        return mRootWindowContainer.startHomeOnAllDisplays(userId, reason);
    }
}
```

```java
//RootWindowContainer.java
boolean startHomeOnAllDisplays(int userId, String reason) {
    //桌面主界面是否启动完毕
    boolean homeStarted = false;
    //这里的循环表示对应 AllDisplays，设备是可能存在多个显示器的
    for (int i = getChildCount() - 1; i >= 0; i--) {
        final int displayId = getChildAt(i).mDisplayId;
        homeStarted |= startHomeOnDisplay(userId, reason, displayId);
    }
    return homeStarted;
}
```

```java
//RootWindowContainer.java
boolean startHomeOnDisplay(int userId, String reason, int displayId) {
    return startHomeOnDisplay(userId, reason, displayId, false /* allowInstrumenting */,
            false /* fromHomeKey */);
}
```

```java
//RootWindowContainer.java
boolean startHomeOnDisplay(int userId, String reason, int displayId, boolean allowInstrumenting,
        boolean fromHomeKey) {
    //如果遇到无效的显示设备，则使用默认的或已获得焦点的最顶部显示ID
    if (displayId == INVALID_DISPLAY) {
        final Task rootTask = getTopDisplayFocusedRootTask();
        displayId = rootTask != null ? rootTask.getDisplayId() : DEFAULT_DISPLAY;
    }

    final DisplayContent display = getDisplayContent(displayId);
    return display.reduceOnAllTaskDisplayAreas((taskDisplayArea, result) ->
                    result | startHomeOnTaskDisplayArea(userId, reason, taskDisplayArea,
                            allowInstrumenting, fromHomeKey),
            false /* initValue */);
}
```
    
```java
//RootWindowContainer.java
boolean startHomeOnTaskDisplayArea(int userId, String reason, TaskDisplayArea taskDisplayArea,
        boolean allowInstrumenting, boolean fromHomeKey) {
    //如果提供的现实区域无效，同样的恢复默认
    if (taskDisplayArea == null) {
        final Task rootTask = getTopDisplayFocusedRootTask();
        taskDisplayArea = rootTask != null ? rootTask.getDisplayArea()
                : getDefaultTaskDisplayArea();
    }

    //‼️重要的来了，桌面也是一个 activity，启动一个 activity，最重要的便是启动目标信息
    Intent homeIntent = null;
    ActivityInfo aInfo = null;
    //
    if (taskDisplayArea == getDefaultTaskDisplayArea()) {
        /*
            1、mService 是 ActivityTaskManagerService
            2、【默认】intent.addCategory(Intent.CATEGORY_HOME); mTopAction = Intent.ACTION_MAIN;
        */
        homeIntent = mService.getHomeIntent();
        aInfo = resolveHomeActivity(userId, homeIntent);
    } else if (shouldPlaceSecondaryHomeOnDisplayArea(taskDisplayArea)) {
        Pair<ActivityInfo, Intent> info = resolveSecondaryHomeActivity(userId, taskDisplayArea);
        aInfo = info.first;
        homeIntent = info.second;
    }
    if (aInfo == null || homeIntent == null) {
        return false;
    }

    //显示总是有一些显示
    if (!canStartHomeOnDisplayArea(aInfo, taskDisplayArea, allowInstrumenting)) {
        return false;
    }

    homeIntent.setComponent(new ComponentName(aInfo.applicationInfo.packageName, aInfo.name));
    homeIntent.setFlags(homeIntent.getFlags() | FLAG_ACTIVITY_NEW_TASK);
    if (fromHomeKey) {
        homeIntent.putExtra(WindowManagerPolicy.EXTRA_FROM_HOME_KEY, true);
        if (mWindowManager.getRecentsAnimationController() != null) {
            mWindowManager.getRecentsAnimationController().cancelAnimationForHomeStart();
        }
    }
    homeIntent.putExtra(WindowManagerPolicy.EXTRA_START_REASON, reason);

    //启动 activity 还得看 activityStartController
    mService.getActivityStartController().startHomeActivity(homeIntent, aInfo, myReason,
            taskDisplayArea);
    return true;
}
```


# activitStartController

```java 
//ActivityStartController.java
//⚠️：这里启动的是 homeItent
void startHomeActivity(Intent intent, ActivityInfo aInfo, String reason,
        TaskDisplayArea taskDisplayArea) {
    //没有任何附加属性，比如没有 activity 动画
    final ActivityOptions options = ActivityOptions.makeBasic();
    //全屏窗口模式
    options.setLaunchWindowingMode(WINDOWING_MODE_FULLSCREEN);
    if (!ActivityRecord.isResolverActivity(aInfo.name)) {
        //指定这是一个桌面 activity 
        options.setLaunchActivityType(ACTIVITY_TYPE_HOME);
    }

    //显示设备ID也指定，似乎 activity 启动需要的参数都将封装到 ActivitOptions 
    final int displayId = taskDisplayArea.getDisplayId();
    options.setLaunchDisplayId(displayId);
    options.setLaunchTaskDisplayArea(taskDisplayArea.mRemoteToken
            .toWindowContainerToken());

    //只是一个变量递增 mDeferResumeCount++，这如何使用 
    mSupervisor.beginDeferResume();

    final Task rootHomeTask;
    try {
        /*
            1、activity 需要依赖 task 容器，所以启动前必须确保 Task 已创建
            2、TaskDisplayArea#createRootTask 需指定 activityType=home_activity，ontop=true 在显示器的顶部创建 rootTask
            3、最终创建是通过 Task.Builder()......build();  至此，存储桌面 activity 的 Task 已经有了
            4、mRootWindowContainer 这个很重要，我们所见到的界面都要依附于它
        */
        rootHomeTask = taskDisplayArea.getOrCreateRootHomeTask(ON_TOP/*true*/);
    } finally {
        //这个跟 mDeferResumeCount++ 对应，这里是 mDeferResumeCount--
        //关于这个还有一个方法：readyToResume() {return mDeferResumeCount == 0;} 
        //true if resume can be called：那估计是哪里进行轮询监听 readyToResume()
        mSupervisor.endDeferResume();
    }

    /*
        1、有了可承载桌面程序的任务栈，接着就要启动桌面 activity
        2、获得一个 activity 启动器 ActivitStarter，开始执行 excute()
        3、启动器似乎使用了工厂模式，默认启动器数量 3 个
        4、启动器主要成员有 ActivityStartController、ActivityTaskManagerService、ActivityTaskSupervisor、ActivityStartInterceptor
        5、在构建请求器过程中还需要构造启动请求参数 mRequest 
    */
    mLastHomeActivityStartResult = obtainStarter(intent, "startHomeActivity: " + reason)
            .setOutActivity(tmpOutRecord)
            .setCallingUid(0)
            .setActivityInfo(aInfo)
            .setActivityOptions(options.toBundle())
            .execute();
    mLastHomeActivityStartRecord = tmpOutRecord[0];
    if (rootHomeTask.mInResumeTopActivity) {
        //开始调用 onResume 声明周期方法，回到 activity 最熟悉的地方
        mSupervisor.scheduleResumeTopActivities();
    }
}
```

关于 `ActivityTaskSupervisor` 负责的任务太多了，估计像个版本要分离部分代码吧

```java
// TODO: This class has become a dumping ground. Let's
// - Move things relating to the hierarchy to RootWindowContainer
// - Move things relating to activity life cycles to maybe a new class called ActivityLifeCycler
// - Move interface things to ActivityTaskManagerService.
// - All other little things to other files.
public class ActivityTaskSupervisor implements RecentTasks.Callbacks {

}
```


# activityStarter

```java
//ActivityStarter.java
int execute() {
    try {
        /*
            1、如果启动请求信息无效，则重新解析并填充启动请求参数
            2、请求参数包括 pid、uid、resolveInfo、activityInfo  .etc
        */
        if (mRequest.activityInfo == null) {
            mRequest.resolveActivity(mSupervisor);
        }

        int res;
        //mGlobalLock 全局服务锁，并没有什么特别，就是一个普通对象
        synchronized (mService.mGlobalLock) {
            final boolean globalConfigWillChange = mRequest.globalConfig != null
                    && mService.getGlobalConfiguration().diff(mRequest.globalConfig) != 0;
            final Task rootTask = mRootWindowContainer.getTopDisplayFocusedRootTask();
            if (rootTask != null) {
                rootTask.mConfigWillChange = globalConfigWillChange;
            }
            final long origId = Binder.clearCallingIdentity();

            /*
                1、什么重量级进程切换，我都懵了😺
                2、如果找不到调用者 app 进程，则终止启动请求 ATMS.getProcessController(request.caller) == null
            */
            res = resolveToHeavyWeightSwitcherIfNeeded();
            if (res != START_SUCCESS) {
                return res;
            }

            //‼️执行启动请求
            res = executeRequest(mRequest);

            mSupervisor.getActivityMetricsLogger().notifyActivityLaunched(launchingState, res,
                    newActivityCreated, mLastStartActivityRecord, originalOptions);
            if (mRequest.waitResult != null) {
                mRequest.waitResult.result = res;
                res = waitResultIfNeeded(mRequest.waitResult, mLastStartActivityRecord,
                        launchingState);
            }
            return getExternalResult(res);
        }
    } finally {
        //执行完成最后一定要回收 activity 启动器
        onExecutionComplete();
    }
}
```

activity 启动请求正式开始，这里将会有很多的启动限制🚫等。

```java
//ActivitStarter.java
private int executeRequest(Request request) {
    //很好奇这个 reason 这么总要吗？干什么用的
    if (TextUtils.isEmpty(request.reason)) {
        throw new IllegalArgumentException("Need to specify a reason.");
    }
    
    //如果中途检测到是非启动成功（触发启动限制），那么立马结束请求，返回结果
    int err = ActivityManager.START_SUCCESS;
    // Pull the optional Ephemeral Installer-only bundle out of the options early.
    final Bundle verificationBundle =
            options != null ? options.popAppVerificationBundle() : null;

    //❌限制1：根据启动请求调用者 caller 寻找是否存在启动 app 进程，如果不存在则返回拦截请求
    WindowProcessController callerApp = null;
    if (caller != null) {
        callerApp = mService.getProcessController(caller);
        if (callerApp != null) {
            callingPid = callerApp.getPid();
            callingUid = callerApp.mInfo.uid;
        } else {
            err = START_PERMISSION_DENIED;
        }
    }

    final int launchFlags = intent.getFlags();
    if ((launchFlags & Intent.FLAG_ACTIVITY_FORWARD_RESULT) != 0 && sourceRecord != null) {
        //❌什么请求冲突？？？
        if (requestCode >= 0) {
            SafeActivityOptions.abort(options);
            return ActivityManager.START_FORWARD_AND_REQUEST_CONFLICT;
        }
    }

    if (err == ActivityManager.START_SUCCESS && intent.getComponent() == null) {
        //❌启动目标 activity 未知，失败
        err = ActivityManager.START_INTENT_NOT_RESOLVED;
    }

    if (err == ActivityManager.START_SUCCESS && aInfo == null) {
        //❌同样的，请求所需要的基础信息都未知，自然中断本次请求
        err = ActivityManager.START_CLASS_NOT_FOUND;
    }

    // voiceSession 语音交互相关 activity【这里其实是 activity 启动都会经过的路途，只是我们本次分析的是‘启动桌面 activity’】
    if (err == ActivityManager.START_SUCCESS && sourceRecord != null
            && sourceRecord.getTask().voiceSession != null) {
        if ((launchFlags & FLAG_ACTIVITY_NEW_TASK) == 0
                && sourceRecord.info.applicationInfo.uid != aInfo.applicationInfo.uid) {
            try {
                intent.addCategory(Intent.CATEGORY_VOICE);
                if (!mService.getPackageManager().activitySupportsIntent(
                        intent.getComponent(), intent, resolvedType)) {
                    //❌不支持语音交互功能？
                    err = ActivityManager.START_NOT_VOICE_COMPATIBLE;
                }
            } catch (RemoteException e) {
                //❌不支持语音交互功能？
                err = ActivityManager.START_NOT_VOICE_COMPATIBLE;
            }
        }
    }

    if (err == ActivityManager.START_SUCCESS && voiceSession != null) {
        try {
            if (!mService.getPackageManager().activitySupportsIntent(intent.getComponent(),
                    intent, resolvedType)) {
                //❌不支持
                err = ActivityManager.START_NOT_VOICE_COMPATIBLE;
            }
        } catch (RemoteException e) {
            //❌不支持
            err = ActivityManager.START_NOT_VOICE_COMPATIBLE;
        }
    }

    if (err != START_SUCCESS) {
        SafeActivityOptions.abort(options);
        return err;
    }

    //检查 activity 启动是否满足条件
    boolean abort = !mSupervisor.checkStartAnyActivityPermission(intent, aInfo, resultWho,
            requestCode, callingPid, callingUid, callingPackage, callingFeatureId,
            request.ignoreTargetSecurity, inTask != null, callerApp, resultRecord,
            resultRootTask);
    abort |= !mService.mIntentFirewall.checkStartActivity(intent, callingUid,
            callingPid, resolvedType, aInfo.applicationInfo);
    abort |= !mService.getPermissionPolicyInternal().checkStartActivity(intent, callingUid,
            callingPackage);

    boolean restrictedBgActivity = false;
    if (!abort) {
        try {
            //继续检查是否满足启动条件
            restrictedBgActivity = shouldAbortBackgroundActivityStart(callingUid,
                    callingPid, callingPackage, realCallingUid, realCallingPid, callerApp,
                    request.originatingPendingIntent, request.allowBackgroundActivityStart,
                    intent);
        } finally {

        }
    }

     
    //略略略～～～


    //没有通过启动检查就要结束执行了
    if (abort) {
        ActivityOptions.abort(checkedOptions);
        return START_ABORTED;
    }

    if (aInfo != null) {
        if (mService.getPackageManagerInternalLocked().isPermissionsReviewRequired(
                aInfo.packageName, userId)) {
            final IIntentSender target = mService.getIntentSenderLocked(
                    ActivityManager.INTENT_SENDER_ACTIVITY, callingPackage, callingFeatureId,
                    callingUid, userId, null, null, 0, new Intent[]{intent},
                    new String[]{resolvedType}, PendingIntent.FLAG_CANCEL_CURRENT
                            | PendingIntent.FLAG_ONE_SHOT, null);

            Intent newIntent = new Intent(Intent.ACTION_REVIEW_PERMISSIONS);

            int flags = intent.getFlags();
            flags |= Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS;

            //设置启动标识，仅设置 NEW_TASK 某些场景不一定会真的创建一个任务栈，但可以置为 MULTIPLE_TASK
            if ((flags & (FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_NEW_DOCUMENT)) != 0) {
                flags |= Intent.FLAG_ACTIVITY_MULTIPLE_TASK;
            }
            newIntent.setFlags(flags);

            newIntent.putExtra(Intent.EXTRA_PACKAGE_NAME, aInfo.packageName);
            newIntent.putExtra(Intent.EXTRA_INTENT, new IntentSender(target));
            if (resultRecord != null) {
                newIntent.putExtra(Intent.EXTRA_RESULT_NEEDED, true);
            }
            intent = newIntent;

            //一堆数据解析和赋值就不看了
            intentGrants = null;
            resolvedType = null;
            callingUid = realCallingUid;
            callingPid = realCallingPid;
            rInfo = mSupervisor.resolveIntent(intent, resolvedType, userId, 0,
                    computeResolveFilterUid(
                            callingUid, realCallingUid, request.filterCallingUid));
            aInfo = mSupervisor.resolveActivity(intent, rInfo, startFlags,
                    null /*profilerInfo*/);
        }
    }

    if (rInfo != null && rInfo.auxiliaryInfo != null) {
        //万事俱备，准备待发，创建一个可以启动的 intent （也就是启动数据每个必要的不可少）
        //应该是有特别之处的，不然为什么不直接使用外部传进来的 intent，具体就不纠结了
        intent = createLaunchIntent(rInfo.auxiliaryInfo, request.ephemeralIntent,
                callingPackage, callingFeatureId, verificationBundle, resolvedType, userId);
        resolvedType = null;
        callingUid = realCallingUid;
        callingPid = realCallingPid;
        intentGrants = null;
        aInfo = mSupervisor.resolveActivity(intent, rInfo, startFlags, null /*profilerInfo*/);
    }

    //每一个 activity 的信息都将记录在 ActivityRecord 中
    final ActivityRecord r = new ActivityRecord.Builder(mService)
            .setCaller(callerApp)
            .setLaunchedFromPid(callingPid)
            .setLaunchedFromUid(callingUid)
            .setLaunchedFromPackage(callingPackage)
            .setLaunchedFromFeature(callingFeatureId)
            .setIntent(intent)
            .setResolvedType(resolvedType)
            .setActivityInfo(aInfo)
            .setConfiguration(mService.getGlobalConfiguration())
            .setResultTo(resultRecord)
            .setResultWho(resultWho)
            .setRequestCode(requestCode)
            .setComponentSpecified(request.componentSpecified)
            .setRootVoiceInteraction(voiceSession != null)
            .setActivityOptions(checkedOptions)
            .setSourceRecord(sourceRecord)
            .build();

    mLastStartActivityRecord = r;
    //‼️好了，又到下一个启动阶段
    mLastStartActivityResult = startActivityUnchecked(r, sourceRecord, voiceSession,
            request.voiceInteractor, startFlags, true /* doResume */, checkedOptions,
            inTask, inTaskFragment, restrictedBgActivity, intentGrants);

    if (request.outActivity != null) {
        request.outActivity[0] = mLastStartActivityRecord;
    }
    return mLastStartActivityResult;
}
```

## checkStartAnyActivityPremission

任何一个 activity 启动都需要检查权限问题。

```java
//ActivitTaskSupervisor.java
boolean checkStartAnyActivityPermission(Intent intent, ActivityInfo aInfo, String resultWho,
        int requestCode, int callingPid, int callingUid, String callingPackage,
        @Nullable String callingFeatureId, boolean ignoreTargetSecurity,
        boolean launchingInTask, WindowProcessController callerApp, ActivityRecord resultRecord,
        Task resultRootTask) {
    //0、✅如果是最近任务列表中的组件 并且 是当前栈中请求启动是允许的
    final boolean isCallerRecents = mService.getRecentTasks() != null
            && mService.getRecentTasks().isCallerRecents(callingUid);
    /*
        1、✅如果是具有超级用户权限的应用请求启动是允许的 appID=Process.ROOT_UID
        2、✅如果是系统应用请求启动是允许的 appID=Process.SYSTEM_UID
        3、❌如果是不同进程是不允许的 UserHandle.isIsolated(uid)
        4、✅如果是设备所有者请求启动是允许的 UserHandle.isSameApp(uid, owningUid)
        5、❌如果目标 activity exported=false 是不被允许启动的
        6、❌如果检查的权限存在 ‘禁止权限列表’中是不被允许的  [至于列表中都有哪些权限我们以后讨论]
    */
    final int startAnyPerm = mService.checkPermission(START_ANY_ACTIVITY, callingPid,
            callingUid);
    if (startAnyPerm == PERMISSION_GRANTED || (isCallerRecents && launchingInTask)) {
        return true;
    }

    //❌component 限制 【跟上述限制差不多，会调用到 checkComponentPermission】
    final int componentRestriction = getComponentRestrictionForCallingPackage(aInfo,
            callingPackage, callingFeatureId, callingPid, callingUid, ignoreTargetSecurity);
    //❌action 限制  【跟上述限制差不多，会调用到 checkPermission】
    final int actionRestriction = getActionRestrictionForCallingPackage(
            intent.getAction(), callingPackage, callingFeatureId, callingPid, callingUid);
    if (componentRestriction == ACTIVITY_RESTRICTION_PERMISSION
            || actionRestriction == ACTIVITY_RESTRICTION_PERMISSION) {
        if (resultRecord != null) {
            resultRecord.sendResult(INVALID_UID, resultWho, requestCode,
                    Activity.RESULT_CANCELED, null /* data */, null /* dataGrants */);
        }
        throw new SecurityException(msg);
    }

    if (actionRestriction == ACTIVITY_RESTRICTION_APPOP) {
        return false;
    } else if (componentRestriction == ACTIVITY_RESTRICTION_APPOP) {
        return false;
    }

    return true;
}
```

## checkIntent

mService.mIntentFirewall.checkStartActivity 最终调用的就是 intent 过滤。

```java
//IntentFirewall.java
public boolean checkIntent(FirewallIntentResolver resolver, ComponentName resolvedComponent,
        int intentType, Intent intent, int callerUid, int callerPid, String resolvedType,
        int receivingUid) {
    boolean log = false;
    boolean block = false;

    List<Rule> candidateRules;
    candidateRules = resolver.queryIntent(intent, resolvedType, false /*defaultOnly*/, 0);
    if (candidateRules == null) {
        candidateRules = new ArrayList<Rule>();
    }
    resolver.queryByComponent(resolvedComponent, candidateRules);

    for (int i=0; i<candidateRules.size(); i++) {
        Rule rule = candidateRules.get(i);
        //intent 过滤规则是什么，规则是如何匹配的？不懂————略！
        if (rule.matches(this, resolvedComponent, intent, callerUid, callerPid, resolvedType,
                receivingUid)) {
            block |= rule.getBlock();
            log |= rule.getLog();
            if (block && log) {
                break;
            }
        }
    }

    if (log) {
        logIntent(intentType, intent, callerUid, resolvedType);
    }

    return !block;
}
```


## checkStartActivity

PermissionPolicyInternal 是一个抽象类，实现类是 PermissionPolicyService 的一个内部类 `private class Internal extends PermissionPolicyInternal `

```java
//PermissionPolicyService.java
private class Internal extends PermissionPolicyInternal {

    @Override
    public boolean checkStartActivity(@NonNull Intent intent, int callingUid,
            @Nullable String callingPackage) {
        if (callingPackage != null && isActionRemovedForCallingPackage(intent, callingUid,
                callingPackage)) {
            return false;
        }
        return true;
    }
```


```java
//PermissionPolicyService.java
private boolean isActionRemovedForCallingPackage(@NonNull Intent intent, int callingUid,
        @NonNull String callingPackage) {
    String action = intent.getAction();
    if (action == null) {
        return false;
    }
    switch (action) {
        case TelecomManager.ACTION_CHANGE_DEFAULT_DIALER:
        case Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT: {
            ApplicationInfo applicationInfo;
            try {
                applicationInfo = getContext().getPackageManager().getApplicationInfoAsUser(
                        callingPackage, 0, UserHandle.getUserId(callingUid));
                if (applicationInfo.targetSdkVersion >= Build.VERSION_CODES.Q) {
                    //只有高版本才会检查这个问题咯
                    return true;
                }
            } catch (PackageManager.NameNotFoundException e) {
                
            }
          
            intent.putExtra(Intent.EXTRA_CALLING_PACKAGE, callingPackage);
            return false;
        }
        default:
            return false;
    }
}
```

## shouldAbortBackgroundActivityStart

```java
boolean shouldAbortBackgroundActivityStart(int callingUid, int callingPid,
        final String callingPackage, int realCallingUid, int realCallingPid,
        WindowProcessController callerApp, PendingIntentRecord originatingPendingIntent,
        boolean allowBackgroundActivityStart, Intent intent) {
    
    //1、✅系统用户应用、具有 Root 权限的应用、NFC （一般是伴生设备）应用请求启动是允许的
    final int callingAppId = UserHandle.getAppId(callingUid);
    if (callingUid == Process.ROOT_UID || callingAppId == Process.SYSTEM_UID
            || callingAppId == Process.NFC_UID) {
        return false;
    }

    //2、✅如果是桌面程序启动是允许的  [正常用户操作不就是点击桌面应用图标然后启动的嘛]
    if (isHomeApp(callingUid, callingPackage)) {
        return false;
    }

    //3、✅设备所有者是允许的
    final WindowState imeWindow = mRootWindowContainer.getCurrentInputMethodWindow();
    if (imeWindow != null && callingAppId == imeWindow.mOwnerUid) {
        return false;
    }

    //4、✅如果有前台应用或可见界面存在前台，这也是允许的
    final int appSwitchState = mService.getBalAppSwitchesState();
    final int callingUidProcState = mService.mActiveUids.getUidState(callingUid);
    final boolean callingUidHasAnyVisibleWindow = mService.hasActiveVisibleWindow(callingUid);
    final boolean isCallingUidForeground = callingUidHasAnyVisibleWindow
            || callingUidProcState == ActivityManager.PROCESS_STATE_TOP
            || callingUidProcState == ActivityManager.PROCESS_STATE_BOUND_TOP;
    final boolean isCallingUidPersistentSystemProcess =
            callingUidProcState <= ActivityManager.PROCESS_STATE_PERSISTENT_UI;

    //5、✅在应用切换过程中，如果有可见的窗口是允许的
    final boolean appSwitchAllowedOrFg =
            appSwitchState == APP_SWITCH_ALLOW || appSwitchState == APP_SWITCH_FG_ONLY;
    if (((appSwitchAllowedOrFg || mService.mActiveUids.hasNonAppVisibleWindow(callingUid))
            && callingUidHasAnyVisibleWindow)
            || isCallingUidPersistentSystemProcess) {
        return false;
    }
    
    final int realCallingUidProcState = (callingUid == realCallingUid)
            ? callingUidProcState
            : mService.mActiveUids.getUidState(realCallingUid);
    final boolean realCallingUidHasAnyVisibleWindow = (callingUid == realCallingUid)
            ? callingUidHasAnyVisibleWindow
            : mService.hasActiveVisibleWindow(realCallingUid);
    final boolean isRealCallingUidForeground = (callingUid == realCallingUid)
            ? isCallingUidForeground
            : realCallingUidHasAnyVisibleWindow
                    || realCallingUidProcState == ActivityManager.PROCESS_STATE_TOP;
    final int realCallingAppId = UserHandle.getAppId(realCallingUid);
    final boolean isRealCallingUidPersistentSystemProcess = (callingUid == realCallingUid)
            ? isCallingUidPersistentSystemProcess
            : (realCallingAppId == Process.SYSTEM_UID)
                    || realCallingUidProcState <= ActivityManager.PROCESS_STATE_PERSISTENT_UI;
    if (realCallingUid != callingUid) {
        //6、✅如果调用的进程有可见的窗口是允许的
        if (realCallingUidHasAnyVisibleWindow) {
            if (DEBUG_ACTIVITY_STARTS) {
                Slog.d(TAG, "Activity start allowed: realCallingUid (" + realCallingUid
                        + ") has visible (non-toast) window");
            }
            return false;
        }

        //7、✅如果是‘系统持久应用’发起的请求是允许的
        if (isRealCallingUidPersistentSystemProcess && allowBackgroundActivityStart) {
            return false;
        }

        //8、✅如果存在伴生设备或者相关可见应用进程是允许的
        if (mService.isAssociatedCompanionApp(UserHandle.getUserId(realCallingUid),
                realCallingUid)) {
            return false;
        }
    }

    //9、✅具备系统权限 START_ACTIVITIES_FROM_BACKGROUND 是允许的
    if (mService.checkPermission(START_ACTIVITIES_FROM_BACKGROUND, callingPid, callingUid)
            == PERMISSION_GRANTED) {
        return false;
    }

    //10、✅如果最近存在相同 uid 进程启动相关组件是允许的（同一个应用）
    if (mSupervisor.mRecentTasks.isCallerRecents(callingUid)) {
        return false;
    }

    //11、✅对于设备所有者请求启动是允许的
    if (mService.isDeviceOwner(callingUid)) {
        return false;
    }

    //12、✅对于伴生设备的请求是允许的
    final int callingUserId = UserHandle.getUserId(callingUid);
    if (mService.isAssociatedCompanionApp(callingUserId, callingUid)) {
        return false;
    }
    
    //13、✅具备系统权限 SYSTEM_ALERT_WINDOW 是允许的
    if (mService.hasSystemAlertWindowPermission(callingUid, callingPid, callingPackage)) {
        return false;
    }

  
    int callerAppUid = callingUid;
    if (callerApp == null) {
        callerApp = mService.getProcessController(realCallingPid, realCallingUid);
        callerAppUid = realCallingUid;
    }
    if (callerApp != null) {
        //‼️来到了新的启动控制类：BackgroundLaunchProcessController#areBackgroundActivityStartsAllowed
        //参考下文
        if (callerApp.areBackgroundActivityStartsAllowed(appSwitchState)) {
            return false;
        }

        final ArraySet<WindowProcessController> uidProcesses =
                mService.mProcessMap.getProcesses(callerAppUid);
        if (uidProcesses != null) {
            for (int i = uidProcesses.size() - 1; i >= 0; i--) {
                final WindowProcessController proc = uidProcesses.valueAt(i);
                //参看下文
                if (proc != callerApp
                        && proc.areBackgroundActivityStartsAllowed(appSwitchState)) {
                    return false;
                }
            }
        }
    }
    
    return true;
}
```

## areBackgroundActivityStartsAllowed

```java
//BackgroundLaunchProcessController.java
boolean areBackgroundActivityStartsAllowed(int pid, int uid, String packageName,
        int appSwitchState, boolean isCheckingForFgsStart,
        boolean hasActivityInVisibleTask, boolean hasBackgroundActivityStartPrivileges,
        long lastStopAppSwitchesTime, long lastActivityLaunchTime,
        long lastActivityFinishTime) {
    if (appSwitchState == APP_SWITCH_ALLOW) {
        final long now = SystemClock.uptimeMillis();
        if (now - lastActivityLaunchTime < ACTIVITY_BG_START_GRACE_PERIOD_MS
                || now - lastActivityFinishTime < ACTIVITY_BG_START_GRACE_PERIOD_MS) {
            if (lastActivityLaunchTime > lastStopAppSwitchesTime
                    || lastActivityFinishTime > lastStopAppSwitchesTime) {
                return true;
            }
        }
    }
    if (hasBackgroundActivityStartPrivileges) {
        return true;
    }

    if (hasActivityInVisibleTask
            && (appSwitchState == APP_SWITCH_ALLOW || appSwitchState == APP_SWITCH_FG_ONLY)) {
        return true;
    }
    if (isBoundByForegroundUid()) {
        return true;
    }
    if (isBackgroundStartAllowedByToken(uid, packageName, isCheckingForFgsStart)) {
        return true;
    }
    return false;
}
```

# startActivityUnchecked

```java
//ActivityStarter.java
private int startActivityUnchecked(final ActivityRecord r, ActivityRecord sourceRecord,
        IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
        int startFlags, boolean doResume, ActivityOptions options, Task inTask,
        TaskFragment inTaskFragment, boolean restrictedBgActivity,
        NeededUriGrants intentGrants) {
}
```


# Reference

- 输入法控件 IME：https://developer.android.google.cn/guide/topics/text/creating-input-method?hl=zh-cn
- [ 关于孤儿进程、僵尸进程的概念 ](https://baike.baidu.com/item/孤儿进程/16751450#:~:text=在操作系统领域中，孤儿进程指的是在其父进程执行完成或被终止后仍继续运行的一类进程%E3%80%82,这些孤儿进程将被init进程%20%28进程号为1%29所收养，并由init进程对它们完成状态收集工作%E3%80%82)
- [ 关于 UID、PID 的了解](https://www.cnblogs.com/perseus/articles/2354173.html)
- [AutofillManager 参考链接 [1]](https://developer.android.google.cn/guide/topics/text/autofill?hl=zh-cn)