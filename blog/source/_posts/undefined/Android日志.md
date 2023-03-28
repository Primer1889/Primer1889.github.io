---
title: Android 日志 logcat
catalog: true
date: 2022-10-24 20:59:07
subtitle: 基于 android-11-r21
header-img: /img/2210/page-native.webp
tags: AOSP
categories:
---

# Android Log
> base/core/java/android/util/Log.java

在 Android 上常用 Log.d 等输出日志，日志分为不同的等级,Linux kernel 常通过 printk 输出日志，日志输出级别 ASSERT, ERROR, WARN, INFO, DEBUG, VERBOSE。

以 Log.d 为例，日志输出有两种：

## printlns
**Log.d(tag,msg,throwable);**
```java
Lod.d(tag,msg,trowable);

printlns(LOG_ID_MAIN, DEBUG, tag, msg, tr);

public static int printlns(int bufID, int priority, @Nullable String tag, @NonNull String msg,
            @Nullable Throwable tr) {
        ImmediateLogWriter logWriter = new ImmediateLogWriter(bufID, priority, tag);
        //缓冲区最小 100
        bufferSize = Math.max(bufferSize, 100);

        //分隔符：lineSeparator = System.getProperty("line.separator");
        LineBreakBufferedWriter lbbw = new LineBreakBufferedWriter(logWriter, bufferSize);

        //1、先打印 msg，再换一行输出
        //2、走一圈 PrintWriter、Writer，最终还是执行 ImmediateLogWriter 的 write 方法由 println_native 输出
        //3、缓冲区扩容还得是 Arrays.copyOf、System.arraycopy 扩大 char[] 
        lbbw.println(msg);

        if (tr != null) {
            Throwable t = tr;
            while (t != null) {
                if (t instanceof UnknownHostException) {
                    break;
                }
                if (t instanceof DeadSystemException) {
                    lbbw.println("DeadSystemException: The system died; "
                            + "earlier logs will point to the root cause");
                    break;
                }
                t = t.getCause();
            }
            if (t == null) {
                tr.printStackTrace(lbbw);
            }
        }

        lbbw.flush();

        return logWriter.getWritten();
    }
```

## println_native
**Log.d(tag,msg);**

那么问题来了，该 native 处于哪个 so 文件或者 cpp 实现在哪里？我们了解一点是 native 方法是根据包名 + 类名可以定位到 native 实现，也就是 android.util.log 可以搜索 android_util_log.cpp 等。
```java
public static native int println_native(int bufID, int priority, String tag, String msg);
```

> base/core/jni/android_util_Log.cpp
> base/core/jni/android_util_Log.h

**core_jni_helper**
- findClass
- getField
- getMethod
- getStaticField
- getStaticMethod
- getStringField
- makeGlobalRef
- AndroidRuntime::registerMethods

方法注册：
```java
static const JNINativeMethod gMethods[] = {
    /* name, signature, funcPtr */
    { "isLoggable",      "(Ljava/lang/String;I)Z", (void*) android_util_Log_isLoggable },
    { "println_native",  "(IILjava/lang/String;Ljava/lang/String;)I", (void*) android_util_Log_println_native },
    { "logger_entry_max_payload_native",  "()I", (void*) android_util_Log_logger_entry_max_payload_native },
};
```

日志输出：
- println_native
- android_util_Log_println_native
- __android_log_buf_write
