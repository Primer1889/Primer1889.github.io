---
title: Android 系统 Home（二）
catalog: true
date: 2022-09-29 22:58:04
subtitle: 启动桌面就是查找并启动 Activity
header-img: /img/220928/android_sysserver_bg.png
tags: AOSP
sticky: 9
categories:
---



![WechatIMG144.jpeg](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4914afa929904b2ea3a66c9758a97c19~tplv-k3u1fbpfcp-watermark.image?)


如果能够用一张图对逝去的一周留个痕迹。

> Read The Fucking Source Code. `—— Linus` \
> \
> 站在'巨人'的肩膀上开始自己的旅途。`—— 佚名` \
> \
> 愉快的周末，从打开💻开始，到骑行归来结束。`—— 佚名`


`注：` 本系列文章源码基于 `Android 11-r21 master 分支`

- [Android 系统启动 \<init>进程 [1]](https://juejin.cn/post/7121229897074212877 "https://juejin.cn/post/7121229897074212877")
- [Android 系统启动 \<zygote> 进程 [2]](https://juejin.cn/post/7123511970871345159 "https://juejin.cn/post/7123511970871345159")
- [Android 系统启动 \<Systemserver> 服务 [3]](https://juejin.cn/post/7125453300660437029 "https://juejin.cn/post/7125453300660437029")
- [Android 源码 \<package> 了解 [4]](https://juejin.cn/post/7126437054002495495 "https://juejin.cn/post/7126437054002495495")
- [Android 源码 \<Activity> 桌面启动一[5]](https://juejin.cn/post/7131666908314599431) 
- [Android 源码 \<Activity> 桌面启动二 [6] ](https://juejin.cn/post/7134256981296021512)
- 敬请期待 🤔


> 继篇 ——— Android 源码 \<Activity> 桌面启动一 [5]

# startActivityUnchecked

```java
//ActivityStarter.java
private int startActivityUnchecked(final ActivityRecord r, ActivityRecord sourceRecord,
        IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
        int startFlags, boolean doResume, ActivityOptions options, Task inTask,
        TaskFragment inTaskFragment, boolean restrictedBgActivity,
        NeededUriGrants intentGrants) {
    int result = START_CANCELED;
    boolean startResultSuccessful = false;
    final Task startedActivityRootTask;

    //TRANSIT_OPEN：创建一个之前不存在的新窗口，并且让窗口可见
    //transitType 还会影响窗口绘制消息延迟时间，默认是 5秒，如果是 chenge 类型延时将缩短到 2 秒
    //也会把 windowContain 添加到集合中，等待窗口绘制
    final TransitionController transitionController = r.mTransitionController;
    Transition newTransition = (!transitionController.isCollecting()
            && transitionController.getTransitionPlayer() != null)
            ? transitionController.createTransition(TRANSIT_OPEN) : null;
    RemoteTransition remoteTransition = r.takeRemoteTransition();
    if (newTransition != null && remoteTransition != null) {
        newTransition.setRemoteTransition(remoteTransition);
    }
    transitionController.collect(r);
    final boolean isTransient = r.getOptions() != null && r.getOptions().getTransientLaunch();
    
    
    try {
        //延迟窗口测量，又使用一个单独的变量 mDeferDepth++，控制测量、绘制次数，避免递归循环
        mService.deferWindowLayout();
        //‼️又是一个启动阶段
        result = startActivityInner(r, sourceRecord, voiceSession, voiceInteractor,
                startFlags, doResume, options, inTask, inTaskFragment, restrictedBgActivity,
                intentGrants);
        startResultSuccessful = ActivityManager.isStartResultSuccessful(result);
        final boolean taskAlwaysOnTop = options != null && options.getTaskAlwaysOnTop();
        // Apply setAlwaysOnTop when starting an Activity is successful regardless of creating
        // a new Activity or recycling the existing Activity.
        if (taskAlwaysOnTop && startResultSuccessful) {
            final Task targetRootTask =
                    mTargetRootTask != null ? mTargetRootTask : mTargetTask.getRootTask();
            targetRootTask.setAlwaysOnTop(true);
        }
    } finally {
        Trace.traceEnd(Trace.TRACE_TAG_WINDOW_MANAGER);
        //‼️无论成功失败与否，启动解释都应该分发出去
        startedActivityRootTask = handleStartResult(r, result);
        //延时窗口测量将被恢复
        mService.continueWindowLayout();
        mSupervisor.mUserLeaving = false;
    }

    postStartActivityProcessing(r, result, startedActivityRootTask);

    return result;
}
```

## about TransitionType
```
@IntDef(prefix = { "TRANSIT_" }, value = {
        TRANSIT_NONE,
        TRANSIT_OPEN,                 //创建一个新的窗口，并且使其可见
        TRANSIT_CLOSE,                //可见的窗口被关闭（finished 或 destroyed）
        TRANSIT_TO_FRONT,             //不可见的窗口将变为可见
        TRANSIT_TO_BACK,              //可见的窗口变为不可见
        TRANSIT_RELAUNCH,
        TRANSIT_CHANGE,               //可见窗口发生改变（比如屏幕方向、大小改变）
        TRANSIT_KEYGUARD_GOING_AWAY,  //（已废弃）
        TRANSIT_KEYGUARD_OCCLUDE,     //键盘锁定
        TRANSIT_KEYGUARD_UNOCCLUDE,   //键盘解锁
        TRANSIT_PIP,                  //画中画
        TRANSIT_WAKE,                 //（正在打开？）
        TRANSIT_FIRST_CUSTOM
})
@Retention(RetentionPolicy.SOURCE)
@interface TransitionType {}
```

# startActivityInner

```java
//ActivityStarter.java
int startActivityInner(final ActivityRecord r, ActivityRecord sourceRecord,
        IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
        int startFlags, boolean doResume, ActivityOptions options, Task inTask,
        TaskFragment inTaskFragment, boolean restrictedBgActivity,
        NeededUriGrants intentGrants) {
    setInitialState(r, options, inTask, inTaskFragment, doResume, startFlags, sourceRecord,
            voiceSession, voiceInteractor, restrictedBgActivity);

    //确定 activity 所启动的任务栈应该是 NEW_TASK 还是在已有的任务栈启动
    computeLaunchingTaskFlags();
    computeSourceRootTask();
    mIntent.setFlags(mLaunchFlags);

    //如果请求已经开始，应该冻结最近任务列表，等待下次更新
    final Task prevTopTask = mPreferredTaskDisplayArea.getFocusedRootTask();
    final Task reusedTask = getReusableTask();
    if (mOptions != null && mOptions.freezeRecentTasksReordering()
            && mSupervisor.mRecentTasks.isCallerRecents(r.launchedFromUid)
            && !mSupervisor.mRecentTasks.isFreezeTaskListReorderingSet()) {
        mFrozeTaskList = true;
        mSupervisor.mRecentTasks.setFreezeTaskListReordering();
    }

    //计算是否有符合条件的任务栈可以复用，否则应该创建新的任务栈
    final Task targetTask = reusedTask != null ? reusedTask : computeTargetTask();
    final boolean newTask = targetTask == null;
    mTargetTask = targetTask;

    //确定启动参数，比如 windowType
    computeLaunchParams(r, sourceRecord, targetTask);

    //又是一番启动限制，在任务栈层面限制启动🚫
    int startResult = isAllowedToStart(r, newTask, targetTask);
    if (startResult != START_SUCCESS) {
        return startResult;
    }

    //复用任务栈
    final ActivityRecord targetTaskTop = newTask
            ? null : targetTask.getTopNonFinishingActivity();
    if (targetTaskTop != null) {
        /*
            1、resumeTargetRootTaskIfNeeded
            2、mRootWindowContainer.resumeFocusedTasksTopActivities
        */
        startResult = recycleTask(targetTask, targetTaskTop, reusedTask, intentGrants);
        if (startResult != START_SUCCESS) {
            return startResult;
        }
    } else {
        mAddingToTask = true;
    }

    /*
        1、如果启动的 activity 是在任务栈中已存在，则只需启动一次，并调用 activity 的 onNewIntent 方法即可
        2、回调方法 deliverNewIntent(top, intentGrants); ActivityRecorder#deliverNewIntentLocked
        3、mAtmService.getLifecycleManager().scheduleTransaction(app.getThread(), appToken,
        NewIntentItem.obtain(ar, mState == RESUMED));
    */
    final Task topRootTask = mPreferredTaskDisplayArea.getFocusedRootTask();
    if (topRootTask != null) {
        startResult = deliverToCurrentTopIfNeeded(topRootTask, intentGrants);
        if (startResult != START_SUCCESS) {
            return startResult;
        }
    }

    //还是一样，如果不存在则创建，如果存在则复用
    if (mTargetRootTask == null) {
        mTargetRootTask = getLaunchRootTask(mStartActivity, mLaunchFlags, targetTask, mOptions);
    }
    if (newTask) {
        final Task taskToAffiliate = (mLaunchTaskBehind && mSourceRecord != null)
                ? mSourceRecord.getTask() : null;
        setNewTask(taskToAffiliate);
    } else if (mAddingToTask) {
        addOrReparentStartingActivity(targetTask, "adding to task");
    }

    //启动的目标任务栈有了，直接看 activity 启动
    final Task startedTask = mStartActivity.getTask();
    final boolean isTaskSwitch = startedTask != prevTopTask && !startedTask.isEmbedded();
    
    //启动
    mTargetRootTask.startActivityLocked(mStartActivity,
            topRootTask != null ? topRootTask.getTopNonFinishingActivity() : null, newTask,
            isTaskSwitch, mOptions, sourceRecord);
    if (mDoResume) {
        final ActivityRecord topTaskActivity = startedTask.topRunningActivityLocked();
        //如果本次启动的 activity 所在任务栈中并没有获得焦点，并且当前启动的不是本次想启动的，也要确保它显示（它可能是更重要的 activity 抢先显示呢）
        if (!mTargetRootTask.isTopActivityFocusable()
                || (topTaskActivity != null && topTaskActivity.isTaskOverlay()
                && mStartActivity != topTaskActivity)) {
                
            mTargetRootTask.ensureActivitiesVisible(null /* starting */,
            mTargetRootTask.mDisplayContent.executeAppTransition();
        } else {
            //如果本次启动的 activity 所在任务栈中并已获得焦点，如果该任务栈没有显示在最前则 moveToFront
            if (mTargetRootTask.isTopActivityFocusable()
                    && !mRootWindowContainer.isTopDisplayFocusedRootTask(mTargetRootTask)) {
                mTargetRootTask.moveToFront("startActivityInner");
            }
            
            //这里和上述 recycleTask 相似，最终也会执行到这个方法。（把 activity 转移为可见状态）
            mRootWindowContainer.resumeFocusedTasksTopActivities(
                    mTargetRootTask, mStartActivity, mOptions, mTransientLaunch);
        }
    }
    
    //启动完毕需要更新最近任务栈等
    mRootWindowContainer.updateUserRootTask(mStartActivity.mUserId, mTargetRootTask);
    mSupervisor.mRecentTasks.add(startedTask);
    mSupervisor.handleNonResizableTaskIfNeeded(startedTask,
            mPreferredWindowingMode, mPreferredTaskDisplayArea, mTargetRootTask);

    return START_SUCCESS;
}
```

## isAllowedToStart

检查 activity 是否可以在已有的任务栈或者新的任务栈中启动。

```java
//ActivityStarter.java
private int isAllowedToStart(ActivityRecord r, boolean newTask, Task targetTask) {
    //❌1、没有包名是不允许的（每个 activity 都有所属的包）
    if (mStartActivity.packageName == null) {
        if (mStartActivity.resultTo != null) {
            mStartActivity.resultTo.sendResult(INVALID_UID, mStartActivity.resultWho,
                    mStartActivity.requestCode, RESULT_CANCELED,
                    null /* data */, null /* dataGrants */);
        }
        ActivityOptions.abort(mOptions);
        return START_CLASS_NOT_FOUND;
    }

    /*
        1、应用处于 instrument 状态时，应该取消启动
        2、如果是 VR 显示ID或者默认显示ID，允许启动
        3、launchMode != SINGLE_TASK && launchMode != SINGLE_INSTANCE 属于已有启动状态，应该取消启动
    */
    if (r.isActivityTypeHome()) {
        if (!mRootWindowContainer.canStartHomeOnDisplayArea(r.info, mPreferredTaskDisplayArea,
                true /* allowInstrumenting */)) {
            return START_CANCELED;
        }
    }

    /*
        1、❌如果是新的任务栈，从后台启动的 activity 是不允许的
        2、❌如果调用者 uid 不是当前程序（当前任务栈），启动时不允许的
        3、❌如果是需要创建新的任务栈，从后台启动的 activity 是不允许的
    */
    boolean blockBalInTask = (newTask
            || !targetTask.isUidPresent(mCallingUid)
            || (LAUNCH_SINGLE_INSTANCE == mLaunchMode && targetTask.inPinnedWindowingMode()));
    // mRestrictedBgActivity：严格把控 activity 的启动🚫（该条件前一篇有提到）
    if (mRestrictedBgActivity && blockBalInTask
            && handleBackgroundActivityAbort(mStartActivity)) {
        return START_ABORTED;
    }

    //还是在不断限制启动，条件苛刻啊
    final boolean isNewClearTask =
            (mLaunchFlags & (FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK))
                    == (FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK);
    if (!newTask) {
        if (mService.getLockTaskController().isLockTaskModeViolation(targetTask,
                isNewClearTask)) {
            return START_RETURN_LOCK_TASK_MODE_VIOLATION;
        }
    } else {
        if (mService.getLockTaskController().isNewTaskLockTaskModeViolation(mStartActivity)) {
            return START_RETURN_LOCK_TASK_MODE_VIOLATION;
        }
    }

    if (mInTaskFragment != null && !canEmbedActivity(mInTaskFragment, r, newTask, targetTask)) {
        return START_PERMISSION_DENIED;
    }

    //✅否则，是启动是允许的
    return START_SUCCESS;
}
```

## canEmbedActivity

是否可以嵌入？activity 嵌入？

```java
//ActivityStarter.java
private boolean canEmbedActivity(@NonNull TaskFragment taskFragment, ActivityRecord starting,
        boolean newTask, Task targetTask) {
    final Task hostTask = taskFragment.getTask();
    if (hostTask == null) {
        return false;
    }

    //✅如果是系统应用，是允许嵌入启动的
    final int hostUid = hostTask.effectiveUid;
    if (UserHandle.getAppId(hostUid) == Process.SYSTEM_UID) {
        return true;
    }

    //❌如果不是当前应用进程启动，是不允许的
    if (hostUid != starting.getUid()) {
        return false;
    }

    //❌如果不是同一个任务栈（主任务栈）中启动，也是不允许的
    return !newTask && (targetTask == null || targetTask == hostTask);
}
```

# startActivityLocked
```java
//Task.java
void startActivityLocked(ActivityRecord r, @Nullable ActivityRecord focusedTopActivity,
        boolean newTask, boolean isTaskSwitch, ActivityOptions options,
        @Nullable ActivityRecord sourceRecord) {
    Task rTask = r.getTask();
    
    final boolean allowMoveToFront = options == null || !options.getAvoidMoveToFront();
    final boolean isOrhasTask = rTask == this || hasChild(rTask);
    
    //启动的 activity 不能是阻塞的，否则将抛出异常
    Task task = null;
    if (!newTask && isOrhasTask) {
        final ActivityRecord occludingActivity = getOccludingActivityAbove(r);
        if (occludingActivity != null) {
            rTask.positionChildAtTop(r);
            ActivityOptions.abort(options);
            return;
        }
    }

    //允许移动到前台，并且不是桌面程序、是最近任务列表任务栈、任务栈已有activity
    if ((!isHomeOrRecentsRootTask() || hasActivity()) && allowMoveToFront) {
        boolean doShow = true;
        if (newTask) {
            if ((r.intent.getFlags() & Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED) != 0) {
                resetTaskIfNeeded(r, r);
                doShow = topRunningNonDelayedActivityLocked(null) == r;
            }
        } else if (options != null && options.getAnimationType()
                == ActivityOptions.ANIM_SCENE_TRANSITION) {
            doShow = false;
        }
        if (r.mLaunchTaskBehind) {
            r.setVisibility(true);
            ensureActivitiesVisible(null, 0, !PRESERVE_WINDOWS);
            mDisplayContent.executeAppTransition();
        } else if (SHOW_APP_STARTING_PREVIEW && doShow) {
            Task baseTask = r.getTask();
            //‼️启动
            final ActivityRecord prev = baseTask.getActivity(
                    a -> a.mStartingData != null && a.showToCurrentUser());
            r.showStartingWindow(prev, newTask, isTaskSwitch,
                    true /* startActivity */, sourceRecord);
        }
    } else {
        //第一个启动的 activity 无需花里胡哨的动画
        ActivityOptions.abort(options);
    }
}
```

# showStartingWindow
```java
//ActivityRecord.java
void showStartingWindow(ActivityRecord prev, boolean newTask, boolean taskSwitch,
        boolean startActivity, ActivityRecord sourceRecord) {
    //覆盖时，不会显示
    if (mTaskOverlay) {
        return;
    }
    
    //共享元素转换时，不限制（共享元素：Android 动画部分）
    if (mPendingOptions != null
            && mPendingOptions.getAnimationType() == ActivityOptions.ANIM_SCENE_TRANSITION) {
        return;
    }

    final CompatibilityInfo compatInfo =
            mAtmService.compatibilityInfoForPackageLocked(info.applicationInfo);

    //是否使用启动页样式
    mSplashScreenStyleEmpty = shouldUseEmptySplashScreen(sourceRecord, startActivity);

    /*
        1、我们这就是启动 activity，所以 startActivit = true，那么将会获取启动主题
        （也就是 Android 高版本每个应用启动都会显示的开屏页？）
        2、开屏主题是可以重写的，首先尝试获取是否重新了开屏主题，将获取主题资源名称
        3、如果没有重写，将会通过 ATMS 根据包名和用户ID获取主题资源名称
        4、如果获取到开屏主题资源名称，那么将根据包名通过 createPackageContext 创建上下文，
           接着根据上下文和主题名称获取资源ID（0 表示使用默认的开屏主题）
    */
    final int splashScreenTheme = startActivity ? getSplashscreenTheme() : 0;
    
    //这里会评估应该使用 theme 主题还是 splashScreenTheme 主题
    final int resolvedTheme = evaluateStartingWindowTheme(prev, packageName, theme,
            splashScreenTheme);


    final boolean activityCreated =
            mState.ordinal() >= STARTED.ordinal() && mState.ordinal() <= STOPPED.ordinal();
    //如果不是新的任务栈，activity 也还没创建，那么本次是热启动
    final boolean newSingleActivity = !newTask && !activityCreated
            && task.getActivity((r) -> !r.finishing && r != this) == null;

    //‼️启动
    final boolean scheduled = addStartingWindow(packageName, resolvedTheme,
            compatInfo, nonLocalizedLabel, labelRes, icon, logo, windowFlags,
            prev, newTask || newSingleActivity, taskSwitch, isProcessRunning(),
            allowTaskSnapshot(), activityCreated, mSplashScreenStyleEmpty);
}
```

# addStartingWindow

```java
//ActivityRecord.java
boolean addStartingWindow(String pkg, int resolvedTheme, CompatibilityInfo compatInfo,
        CharSequence nonLocalizedLabel, int labelRes, int icon, int logo, int windowFlags,
        ActivityRecord from, boolean newTask, boolean taskSwitch, boolean processRunning,
        boolean allowTaskSnapshot, boolean activityCreated, boolean useEmpty) {
    //窗口被冻结，不能显示
    if (!okToDisplay()) {
        return false;
    }

    if (mStartingData != null) {
        return false;
    }

    //已有窗口在显示，不能再显示了
    final WindowState mainWin = findMainWindow();
    if (mainWin != null && mainWin.mWinAnimator.getShown()) {
        return false;
    }

    final TaskSnapshot snapshot =
            mWmService.mTaskSnapshotController.getSnapshot(task.mTaskId, task.mUserId,
                    false /* restoreFromDisk */, false /* isLowResolution */);
                    
     //STARTING_WINDOW_TYPE_NONE、STARTING_WINDOW_TYPE_SNAPSHOT、STARTING_WINDOW_TYPE_SPLASH_SCREEN
    final int type = getStartingWindowType(newTask, taskSwitch, processRunning,
            allowTaskSnapshot, activityCreated, snapshot);

    //逐渐的，这里似乎更多的是和 window 窗口相关（麻了麻了，我只想看 activity 相关，细节太难了）
    if (type == STARTING_WINDOW_TYPE_SNAPSHOT) {
        if (isActivityTypeHome()) {
            mWmService.mTaskSnapshotController.removeSnapshotCache(task.mTaskId);
            if ((mDisplayContent.mAppTransition.getTransitFlags()
                    & WindowManager.TRANSIT_FLAG_KEYGUARD_GOING_AWAY_NO_ANIMATION) == 0) {
                return false;
            }
        }
        
        //【分支一】
        return createSnapshot(snapshot, typeParameter);
    }


    ProtoLog.v(WM_DEBUG_STARTING_WINDOW, "Creating SplashScreenStartingData");
    mStartingData = new SplashScreenStartingData(mWmService, pkg,
            resolvedTheme, compatInfo, nonLocalizedLabel, labelRes, icon, logo, windowFlags,
            getMergedOverrideConfiguration(), typeParameter);
            
    //【分支二】
    scheduleAddStartingWindow();
    return true;
}
```

上述无论是**分支一、分支二**，都会走到同一个方法`scheduleAddStartingWindow`。

# scheduleAddStartingWindow

```java
//ActivityRecord.java
void scheduleAddStartingWindow() {
    if (StartingSurfaceController.DEBUG_ENABLE_SHELL_DRAWER) {
        mAddStartingWindow.run();
    } else {
        //把消息添加到队列最前面优先处理？
        if (!mWmService.mAnimationHandler.hasCallbacks(mAddStartingWindow)) {
            //mWmService：WindowManagerService
            //mAnimationHandler：final Handler mAnimationHandler = new Handler(AnimationThread.getHandler().getLooper());
            mWmService.mAnimationHandler.postAtFrontOfQueue(mAddStartingWindow);
        }
    }
}
```

这里的事情和 window 窗口关系密切，surface 看着绘制相关。

```java
//ActivityRecord.java

private final AddStartingWindow mAddStartingWindow = new AddStartingWindow();

private class AddStartingWindow implements Runnable {

    @Override
    public void run() {
        //略略略，看不出它干了啥
    }
}
```

窗口相关的到此为止吧，再进入看不懂了。我更关注的是 activity 声明周期回调，可迟迟没有看见💔

---

那么这我们姑且他成功地把 activity 添加到 window 上，现在是时候回头看看**启动成功后做了些什么？** 所以我们回到 `ActivityStarter.java`，自然还是回到这里 ~~（从哪来，回哪去吧）~~


# The callback [onNewIntent]

这里讲 `Activity onNewIntent(Intent intent)` 生命周期回调，其实像 onCreat、onResume 等也是相似的，其他的不重复。

## deliverToCurrentTopIfNeeded

```java
//ActivityStarter.java
int startActivityInner(final ActivityRecord r, ActivityRecord sourceRecord,
        IVoiceInteractionSession voiceSession, IVoiceInteractor voiceInteractor,
        int startFlags, boolean doResume, ActivityOptions options, Task inTask,
        TaskFragment inTaskFragment, boolean restrictedBgActivity,
        NeededUriGrants intentGrants) {
        

    //如果正在启动的 activity 和任务栈顶部的 activity 相同
    final Task topRootTask = mPreferredTaskDisplayArea.getFocusedRootTask();
    if (topRootTask != null) {
        //顶部是同一个 activity，无需重复创建，启动一次就可以，也就是我们知道的应该回调 onNewIntent
        startResult = deliverToCurrentTopIfNeeded(topRootTask, intentGrants);
        if (startResult != START_SUCCESS) {
            return startResult;
        }
    }       
}
```

## deliverToCurrentTopIfNeeded

```
private int deliverToCurrentTopIfNeeded(Task topRootTask, NeededUriGrants intentGrants) {
    //获取当前栈顶 activity
    final ActivityRecord top = topRootTask.topRunningNonDelayedActivityLocked(mNotTop);
    
    //activity 相同、启动用户相同、栈顶复用、启动目标
    final boolean dontStart = top != null
            && top.mActivityComponent.equals(mStartActivity.mActivityComponent)
            && top.mUserId == mStartActivity.mUserId
            && top.attachedToProcess()
            && ((mLaunchFlags & FLAG_ACTIVITY_SINGLE_TOP) != 0
            || LAUNCH_SINGLE_TOP == mLaunchMode)
            && (!top.isActivityTypeHome() || top.getDisplayArea() == mPreferredTaskDisplayArea);
    if (!dontStart) {
        return START_SUCCESS;
    }

    top.getTaskFragment().clearLastPausedActivity();
    //activity 显示，后面看
    if (mDoResume) {
        mRootWindowContainer.resumeFocusedTasksTopActivities();
    }
    
    //这里会进入 ActivitRecord
    deliverNewIntent(top, intentGrants);
    return START_DELIVERED_TO_TOP;
}
```

## deliverNewIntentLocked

```java
//ActivityRecord.java
final void deliverNewIntentLocked(int callingUid, Intent intent, NeededUriGrants intentGrants,

    if ((mState == RESUMED || mState == PAUSED || isTopActivityWhileSleeping)
            && attachedToProcess()) {
        try {
            ArrayList<ReferrerIntent> ar = new ArrayList<>(1);
            ar.add(rintent);
            //开始调用声明周期相关，通过发送一个客户端事务 ClientTransaction
            //getLifecycleManager -> ClientLifecycleManager 声明周期相关回调都会通过它
            mAtmService.getLifecycleManager().scheduleTransaction(app.getThread(), appToken,
                    NewIntentItem.obtain(ar, mState == RESUMED));
            unsent = false;
        } catch (RemoteException e) {
            Slog.w(TAG, "Exception thrown sending new intent to " + this, e);
        } catch (NullPointerException e) {
            Slog.w(TAG, "Exception thrown sending new intent to " + this, e);
        }
    }
    
    if (unsent) {
        addNewIntentLocked(rintent);
    }
}
```


```java
//ClientLfecycleManager.java
void scheduleTransaction(ClientTransaction transaction) throws RemoteException {
    //创建一个事物之后开始执行，关键是这个是事务（binder)事务传递数据的，或则事务发送后将在哪里处理事务？？？
    final IApplicationThread client = transaction.getClient();
    transaction.schedule();
    if (!(client instanceof Binder)) {
        transaction.recycle();
    }
}
```

## ClientTransaction.schedule

`ClientTransaction`: A container that holds a sequence of messages, which may be sent to a client. This includes a list of callbacks and a final lifecycle state.


```java
//ClientTransaction.java

/*
    1、IApplicationThread 这是一个标准的 aidl 接口，接口实现自然是 IApplicationThread.Sub
    2、实现类在 ActivityThread，private class ApplicationThread extends IApplicationThread.Stub 
*/
private IApplicationThread mClient;


/**
 * Schedule the transaction after it was initialized. It will be send to client and all its
 * individual parts will be applied in the following sequence:
 * 1. The client calls {@link #preExecute(ClientTransactionHandler)}, which triggers all work
 *    that needs to be done before actually scheduling the transaction for callbacks and
 *    lifecycle state request.
 * 2. The transaction message is scheduled.
 * 3. The client calls {@link TransactionExecutor#execute(ClientTransaction)}, which executes
 *    all callbacks and necessary lifecycle transitions.
 */
public void schedule() throws RemoteException 
    mClient.scheduleTransaction(this);
}
```


## ApplicationThread.scheduleTransaction

```java
//ActivityThread.java
private class ApplicationThread extends IApplicationThread.Stub{

    @Override
    public void scheduleTransaction(ClientTransaction transaction) throws RemoteException {
        //在当前类文件搜索没看到方法定义，差点怀疑人生；然后看看 ActivitThread 还有父类，那方法定义就在父类了
        ActivityThread.this.scheduleTransaction(transaction);
    }
}
```

```java
public final class ActivityThread extends ClientTransactionHandler
        implements ActivityThreadInternal {  
}
```

```java
public abstract class ClientTransactionHandler {

    void scheduleTransaction(ClientTransaction transaction) {
        transaction.preExecute(this);
        //发送消息，那者就明确很多了
        sendMessage(ActivityThread.H.EXECUTE_TRANSACTION, transaction);
    }
```

```java
//ActivityThread.java
class H extends Handler {
    
    public static final int EXECUTE_TRANSACTION = 159;

    public void handleMessage(Message msg) {
        switch (msg.what) {
            case EXECUTE_TRANSACTION:
                //回头看看 schedule 的注释，下一步应该会到哪里去执行，其实别人是写得很清楚的（熟能生巧，初看确实一头雾水）
                final ClientTransaction transaction = (ClientTransaction) msg.obj;
                mTransactionExecutor.execute(transaction);
                if (isSystem()) {
                    transaction.recycle();
                }
            break;
        }
     }
}
```

## TransactionExecutor.excute

```java
//TransactionExecutor.java
public void execute(ClientTransaction transaction) {
    if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "Start resolving transaction");

    //似乎每一个 activity 都有一个 token，还不清楚从何而来
    //初学 Android 时，关于 activity token 的报错估计你也遇到过
    final IBinder token = transaction.getActivityToken();
    if (token != null) {
        final Map<IBinder, ClientTransactionItem> activitiesToBeDestroyed =
                mTransactionHandler.getActivitiesToBeDestroyed();
        final ClientTransactionItem destroyItem = activitiesToBeDestroyed.get(token);
        if (destroyItem != null) {
            if (transaction.getLifecycleStateRequest() == destroyItem) {
                activitiesToBeDestroyed.remove(token);
            }
            if (mTransactionHandler.getActivityClient(token) == null) {
                return;
            }
        }
    }
    
    //这个暂不关注，重点看看下面的生命周期回调吧
    executeCallbacks(transaction);
    
    /*
        1、cycleToPath(r, lifecycleItem.getTargetState(), true , transaction);  -> performLifecycleSequence
        
        //看了一圈，着两个实现应该是在子类
        2、lifecycleItem.execute(mTransactionHandler, token, mPendingActions);
        3、lifecycleItem.postExecute(mTransactionHandler, token, mPendingActions);
    */
    executeLifecycleState(transaction);
    mPendingActions.clear();
    if (DEBUG_RESOLVER) Slog.d(TAG, tId(transaction) + "End resolving transaction");
}
```


```java
//TransactionExecutor.java
private void performLifecycleSequence(ActivityClientRecord r, IntArray path,
        ClientTransaction transaction) {
    final int size = path.size();
    for (int i = 0, state; i < size; i++) {
        state = path.get(i);
        
        //是吧，几个生命周期的回调都有；那就奇怪了怎么没有 onNewIntent，他不算是生命周期函数吗？
        //咚咚咚咚（敲黑板～）
        /*
            1、onNewIntent 不是生命周期回调方法，只是声明周期回调过程中可能被执行的一个方法
            2、如果满足某些条件，根据经验我们知道这个方法在 onResume 之前会执行
            3、那么我们猜测（我看了代码再来猜测的😏），该方法的回调有没有可能在 handleResumeActivity 里面执行？那就去看看吧！
        */
        switch (state) {
            case ON_CREATE:
                mTransactionHandler.handleLaunchActivity(r, mPendingActions,
                        null /* customIntent */);
                break;
            case ON_START:
                mTransactionHandler.handleStartActivity(r, mPendingActions,
                        null /* activityOptions */);
                break;
            case ON_RESUME:
                mTransactionHandler.handleResumeActivity(r, false /* finalStateRequest */,
                        r.isForward, "LIFECYCLER_RESUME_ACTIVITY");
                break;
            case ON_PAUSE:
                mTransactionHandler.handlePauseActivity(r, false /* finished */,
                        false /* userLeaving */, 0 /* configChanges */, mPendingActions,
                        "LIFECYCLER_PAUSE_ACTIVITY");
                break;
            case ON_STOP:
                mTransactionHandler.handleStopActivity(r, 0 /* configChanges */,
                        mPendingActions, false /* finalStateRequest */,
                        "LIFECYCLER_STOP_ACTIVITY");
                break;
            case ON_DESTROY:
                mTransactionHandler.handleDestroyActivity(r, false /* finishing */,
                        0 /* configChanges */, false /* getNonConfigInstance */,
                        "performLifecycleSequence. cycling to:" + path.get(size - 1));
                break;
            case ON_RESTART:
                mTransactionHandler.performRestartActivity(r, false /* start */);
                break;
            default:
                throw new IllegalArgumentException("Unexpected lifecycle state: " + state);
        }
    }
}
```

ClientTransactionHandler 是个抽象方法，所以声明周期回调还得找 ClientTransactionHandler 的实现类 `ActivitThread`。

绕一圈又回来，这这这～～～

![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/69c055d008d74b45bd1205352739f8b9~tplv-k3u1fbpfcp-watermark.image?)


## ActivitThread.performResumeActivity

```java
//ActivityThread.java
public boolean performResumeActivity(ActivityClientRecord r, boolean finalStateRequest,
        String reason) {

    if (r.activity.mFinished) {
        return false;
    }
    
    //已经 resumed 就不重复了
    if (r.getLifecycleState() == ON_RESUME) {
        if (!finalStateRequest) {
            final RuntimeException e = new IllegalStateException(
                    "Trying to resume activity which is already resumed");
        }
        return false;
    }
    
    if (finalStateRequest) {
        r.hideForNow = false;
        r.activity.mStartedActivity = false;
    }
    
    try {
        r.activity.onStateNotSaved();
        r.activity.mFragments.noteStateNotSaved();
        checkAndBlockForNetworkAccess();
        //看到没，满足某些条件情况下是会走 onNewIntent 
        if (r.pendingIntents != null) {
            deliverNewIntents(r, r.pendingIntents);
            r.pendingIntents = null;
        }
        
        if (r.pendingResults != null) {
            deliverResults(r, r.pendingResults, reason);
            r.pendingResults = null;
        }
        
        //onResume 回调在这里，本次我们暂不关注
        r.activity.performResume(r.startsNotResumed, reason);

        //把状态设置一下
        r.state = null;
        r.persistentState = null;
        r.setState(ON_RESUME);

        reportTopResumedActivityChanged(r, r.isTopResumedActivity, "topWhenResuming");
    } catch (Exception e) {
        if (!mInstrumentation.onException(r.activity, e)) {
            throw new RuntimeException("Unable to resume activity "
                    + r.intent.getComponent().toShortString() + ": " + e.toString(), e);
        }
    }
    return true;
}
```

```java
//ActivityThread.java
private void deliverNewIntents(ActivityClientRecord r, List<ReferrerIntent> intents) {
    final int N = intents.size();
    for (int i=0; i<N; i++) {
        ReferrerIntent intent = intents.get(i);
        intent.setExtrasClassLoader(r.activity.getClassLoader());
        intent.prepareToEnterProcess(isProtectedComponent(r.activityInfo),
                r.activity.getAttributionSource());
        r.activity.mFragments.noteStateNotSaved();
        //最后还是交给 ‘大管家’ 执行啊，回到了那个熟悉的对象
        mInstrumentation.callActivityOnNewIntent(r.activity, intent);
    }
}
```

## Instrumentation.callActivityOnNewIntent

```java
//Instrumentation.java
public void callActivityOnNewIntent(Activity activity, ReferrerIntent intent) {
    final String oldReferrer = activity.mReferrer;
    try {
        if (intent != null) {
            activity.mReferrer = intent.mReferrer;
        }
        callActivityOnNewIntent(activity, intent != null ? new Intent(intent) : null);
    } finally {
        activity.mReferrer = oldReferrer;
    }
}
```

```java
//Instrumentation.java
public void callActivityOnNewIntent(Activity activity, Intent intent) {
    //什么？Instrumentation 不熟悉？
    //那 activity 总该熟悉了吧
    activity.performNewIntent(intent);
}
```

```java
//Activity.java
final void performNewIntent(@NonNull Intent intent) {
    mCanEnterPictureInPicture = true;
    onNewIntent(intent);
}
```

```java
//Activity.java
protected void onNewIntent(Intent intent) {
}
```



就到这里结束吧，看起来没那么像样。虽然是 `桌面启动`，后来越感觉像是 `Activity 启动`。~~都乱套了~~ ，可是，桌面不也是一个 activity 吗🤔️


![89a4d9d2cddbe19944fce634088f750.jpg](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/496ab72c693e4198a932a0f05fe62a06~tplv-k3u1fbpfcp-watermark.image?)

> 就到这吧，桌面启动顺带 Activity 启动（虽然 Activity 启动事实上还是有区别的）


