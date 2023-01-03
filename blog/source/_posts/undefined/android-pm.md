---
title: pm 应用程序安装管理（八）
catalog: true
date: 2022-10-23 10:00:16
subtitle: 基于 android-11-r21
header-img: /img/2210/page-native.jpg
tags: AOSP
categories:
---

# Warm-up

1、安装方式（系统）
- adb 安装（程序）
- 点击安装（用户）
- 第三方应用安装（用户）

2、安装入口流程
- InstallStart 被匹配到开始执行安装，pm 的清单配置文件匹配到特定的 action 和 mimeType 会启动对应的 activity
- 跳转到 InstallStaging activity
- 再跳转到 PackageInstallerActivity

3、安装包类型
- 普通型
- 系统（使用系统签名 Application.FLAGE_SYSYEM）
    - 具有特定 shareUID 的应用
    - 在特定目录安装的应用（如 /system/app、/vendor/app、//oem/app）
- 特权（Application.PRIVATE_FLAG_PRIVILEGEN）
    - 具有特定 shareUID 的应用
    - 在特定目录安装的应用（如 /system/framework、/system/friv-app、/vendor/priv-app）

4、主要管理类
- PackageManager：
- IPackageManager：aidl 接口，实现类 packageManagerService（implement IPackageManager.Sub）
- AppOpsManager：动态权限监测
- UserManager：安装包升级、卸载、安装
- PackageInstaller：多用户管理

5、安装后的流程
- 成功
- 失败

6、代码位置

> 重要路径
- base/core/java/android/content/pm
- base/services/core/java/com/android/server/pm【服务】
- base/packages/PackageInstaller【入口】

> 目录结构
- pm
    - dex
    - overlay
    - parsing
    - permission
    - split
    - verify
        - domain

# InstallStart
> base/packages/PackageInstaller/src/com/android/packageinstaller/InstallStart.java

此类是安装流程开始第一个可见的界面 activity，负责把外部传入的 intent 进行分发。

关于 InstallStart 在 AndroidManifest 的配置：
- exported=true
- excludeFromRecents=true
- scheme=content
- action=action.VIEW
- action=action.INSTALL_PACKAGE
- mimeType=application/vnd.android.package-archive【数据类型匹配规则：mimeType + url,此 mimeType 的值即表示 data 数据是安装包】

```java
public class InstallStart extends Activity {

    pm;
    um;

    protected void onCreate(@Nullable Bundle savedInstanceState) {

        //携带安装包信息
        Intent intent = getIntent();
        //需知道是哪个应用调用安装，返回调用者包名，进一步知道调用者 uid
        String callingPackage = getCallingPackage();
        //确保调用者是可信任的
        boolean isTrustedSource = false;

        //不可信任、无权限、未知 sdk 版本
        if (!isTrustedSource && originatingUid != PackageInstaller.SessionParams.UID_UNKNOWN) {
            final int targetSdkVersion = getMaxTargetSdkVersionForUid(this, originatingUid);
            if (targetSdkVersion < 0) {
                mAbortInstall = true;
            } else if (targetSdkVersion >= Build.VERSION_CODES.O && !isUidRequestingPermission(
                    originatingUid, Manifest.permission.REQUEST_INSTALL_PACKAGES)) {
                mAbortInstall = true;
            }
        }
        if (mAbortInstall) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        //此处主要是关注 intent 被转发的下一个 activity
        Intent nextActivity = new Intent(intent);
       
        if (isSessionInstall) {
            nextActivity.setClass(this, PackageInstallerActivity.class);
         } else {
            Uri packageUri = intent.getData();
            //androidManifest 配置了两个 action，看外部调用者如何配置
            if (packageUri != null && packageUri.getScheme().equals(
                    ContentResolver.SCHEME_CONTENT)) {
                nextActivity.setClass(this, InstallStaging.class);
            } else if (packageUri != null && packageUri.getScheme().equals(
                    PackageInstallerActivity.SCHEME_PACKAGE)) {
                nextActivity.setClass(this, PackageInstallerActivity.class);
            } else {
                Intent result = new Intent();
                result.putExtra(Intent.EXTRA_INSTALL_RESULT,
                        PackageManager.INSTALL_FAILED_INVALID_URI);
                setResult(RESULT_FIRST_USER, result);
                nextActivity = null;
            }
        }

        if (nextActivity != null) {
            startActivity(nextActivity);
        }
        finish();
    }

}
```

很明显，InstallStart 选择将 intent 分发给那个界面：
- PackageInstallerActivity【根据 session 判断选择，我们认为用户首次安装时候不会走此分支】
- InstallStaging【用户第一次安装应当走此分支】

## InstallStaging
> base/packages/PackageInstaller/src/com/android/packageinstaller/InstallStaging.java

```java
public class InstallStaging extends AlertActivity {
    //异步任务
    private @Nullable StagingAsyncTask mStagingTask;

    protected void onResume() {
        super.onResume();
        if (mStagingTask == null) {
            if (mStagedFile == null) {
                try {
                    mStagedFile = TemporaryFileManager.getStagedFile(this);
                } catch (IOException e) {
                    showError();
                    return;
                }
            }

            //启动任务
            mStagingTask = new StagingAsyncTask();
            mStagingTask.execute(getIntent().getData());
        }
    }

    private final class StagingAsyncTask extends AsyncTask<Uri, Void, Boolean> {
        @Override
        protected Boolean doInBackground(Uri... params) {
            if (params == null || params.length <= 0) {
                return false;
            }

            Uri packageUri = params[0];
            try (InputStream in = getContentResolver().openInputStream(packageUri)) {
                try (OutputStream out = new FileOutputStream(mStagedFile)) {
                    //把 data 数据写入文件中
                }
            } catch (IOException | SecurityException | IllegalStateException e) {
                return false;
            }
            return true;
        }

        @Override
        protected void onPostExecute(Boolean success) {
            if (success) {
                Intent installIntent = new Intent(getIntent());
                installIntent.setClass(InstallStaging.this, DeleteStagedFileOnResult.class);
                //数据
                installIntent.setData(Uri.fromFile(mStagedFile));

                if (installIntent.getBooleanExtra(Intent.EXTRA_RETURN_RESULT, false)) {
                    installIntent.addFlags(Intent.FLAG_ACTIVITY_FORWARD_RESULT);
                }

                installIntent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
                startActivity(installIntent);

                InstallStaging.this.finish();
            }
        }
    }
}
```

文件写入成功，接着跳转到下一个界面 DeleteStagedFileOnResult。

### DeleteStagedFileOnResult
> base/packages/PackageInstaller/src/com/android/packageinstaller/DeleteStagedFileOnResult.java

删除安装包文件要单独起一个跳板？

```java
public class DeleteStagedFileOnResult extends Activity {

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (savedInstanceState == null) {
            Intent installIntent = new Intent(getIntent());
            installIntent.setClass(this, PackageInstallerActivity.class);
            installIntent.setFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION);
            startActivityForResult(installIntent, 0);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        setResult(resultCode, data);
        finish();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();

        if (isFinishing()) {
            File sourceFile = new File(getIntent().getData().getPath());
            new Thread(sourceFile::delete).start();
        }
    }
}
```

# PackageInstallerActivity
> base/packages/PackageInstaller/src/com/android/packageinstaller/PackageInstallerActivity.java

主要负责解析安装包信息，解析失败则提示错误，解析成功提示安装‘未知应用’，如果内存许可则进行下一步安装。

```java
public class PackageInstallerActivity extends AlertActivity {

    pm;
    ipm;//pms packageManagerService
    ops;
    um;

    protected void onCreate(Bundle icicle) {
        final Intent intent = getIntent();
        //安装包 uri
        final Uri packageUri;

        if (PackageInstaller.ACTION_CONFIRM_INSTALL.equals(intent.getAction())) {
            final PackageInstaller.SessionInfo info = mInstaller.getSessionInfo(sessionId);
            packageUri = Uri.fromFile(new File(info.resolvedBaseCodePath));
        } else {
            packageUri = intent.getData();
        }

        if (packageUri == null) {
            setPmResult(PackageManager.INSTALL_FAILED_INVALID_URI);
            finish();
            return;
        }

        boolean wasSetUp = processPackageUri(packageUri);
        if (!wasSetUp) {
            return;
        }
    }

    /*
        解析获得数据
        mAppSnippet：应用图标和名称
        mPkgInfo：
        mPackageURI：
    */
    private boolean processPackageUri(final Uri packageUri) {
        final String scheme = packageUri.getScheme();
        switch (scheme) {
            case SCHEME_PACKAGE: {
                try {
                    mPkgInfo = mPm.getPackageInfo(packageUri.getSchemeSpecificPart(),
                            PackageManager.GET_PERMISSIONS
                                    | PackageManager.MATCH_UNINSTALLED_PACKAGES);
                } catch (NameNotFoundException e) {
                }
                if (mPkgInfo == null) {
                    setPmResult(PackageManager.INSTALL_FAILED_INVALID_APK);
                    return false;
                }
                CharSequence label = mPm.getApplicationLabel(mPkgInfo.applicationInfo);
                mAppSnippet = new PackageUtil.AppSnippet(label,
                        mPm.getApplicationIcon(mPkgInfo.applicationInfo));
            } break;

            case ContentResolver.SCHEME_FILE: {
                File sourceFile = new File(packageUri.getPath());
                mPkgInfo = PackageUtil.getPackageInfo(this, sourceFile,
                        PackageManager.GET_PERMISSIONS);
                if (mPkgInfo == null) {
                    setPmResult(PackageManager.INSTALL_FAILED_INVALID_APK);
                    return false;
                }
                mAppSnippet = PackageUtil.getAppSnippet(this, mPkgInfo.applicationInfo, sourceFile);
            } break;

            default: {
                throw new IllegalArgumentException("Unexpected URI scheme " + packageUri);
            }
        }

        return true;
    }

        @Override
    protected void onResume() {
        if (mAppSnippet != null) {
            //安装提示界面，设置包名、图标，点击确认开始安装：startInstall();
            bindUi();
            //如果已安装有相同包名的应用，则更新 UI 为‘更新应用’，
            checkIfAllowedAndInitiateInstall();
        }
    }

    //该方法是点击‘安装’执行，将跳转到下一个 activity
    private void startInstall() {
        Intent newIntent = new Intent();
        newIntent.putExtra(PackageUtil.INTENT_ATTR_APPLICATION_INFO,
                mPkgInfo.applicationInfo);
        newIntent.setData(mPackageURI);
        newIntent.setClass(this, InstallInstalling.class);
        String installerPackageName = getIntent().getStringExtra(
                Intent.EXTRA_INSTALLER_PACKAGE_NAME);
        if (installerPackageName != null) {
            newIntent.putExtra(Intent.EXTRA_INSTALLER_PACKAGE_NAME,
                    installerPackageName);
        }
        newIntent.addFlags(Intent.FLAG_ACTIVITY_FORWARD_RESULT);
        startActivity(newIntent);
        finish();
    }
}
```

# InstallInstalling
> base/packages/PackageInstaller/src/com/android/packageinstaller/InstallInstalling.java

PackageManager 实现类 ApplicationPackageManager。

```java
public class InstallInstalling extends AlertActivity {

    //异步任务
    private InstallingAsyncTask mInstallingTask;
    //安装包
    private Uri mPackageURI;

    protected void onCreate(@Nullable Bundle savedInstanceState) {

        mPackageURI = getIntent().getData();
        if ("package".equals(mPackageURI.getScheme())) {
            try {
                getPackageManager().installExistingPackage(appInfo.packageName);
                //分支1，应用已经安装，将进入 InstallSuccess activity
                launchSuccess();
            } catch (PackageManager.NameNotFoundException e) {
                //分支2
                launchFailure(PackageInstaller.STATUS_FAILURE,
                        PackageManager.INSTALL_FAILED_INTERNAL_ERROR, null);
            }
        } else {            
            if (savedInstanceState != null) {
                try {
                    //注册安装事件监听
                    InstallEventReceiver.addObserver(this, mInstallId,this::launchFinishBasedOnResult);
                } catch (EventResultPersister.OutOfIdsException e) {
                    // Does not happen
                }
            } else {
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                        PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                //解析安装包
                File file = new File(mPackageURI.getPath());
                try {
                    final ParseTypeImpl input = ParseTypeImpl.forDefaultParsing();
                    //开始解析，一种是解析目录下的文件，另一种是解析 apk 本身
                    final ParseResult<PackageLite> result = ApkLiteParseUtils.parsePackageLite(
                            input.reset(), file, /* flags */ 0);
                    if (result.isError()) {
                        //解析错误为什么设置长度为文件大小？
                        params.setSize(file.length());
                    } else {
                        final PackageLite pkg = result.getResult();
                        params.setAppPackageName(pkg.getPackageName());
                        params.setInstallLocation(pkg.getInstallLocation());
                        params.setSize(
                                PackageHelper.calculateInstalledSize(pkg, params.abiOverride));
                    }
                } catch (IOException e) {
                    params.setSize(file.length());
                }

                //解析成功，同样需要监听安装事件
                try {
                    //这是一个系统广播
                    mInstallId = InstallEventReceiver
                            .addObserver(this, EventResultPersister.GENERATE_NEW_ID,
                                    this::launchFinishBasedOnResult);
                } catch (EventResultPersister.OutOfIdsException e) {
                    launchFailure(PackageInstaller.STATUS_FAILURE,
                            PackageManager.INSTALL_FAILED_INTERNAL_ERROR, null);
                }
            }
        }
    }

    //开始安装
    protected void onResume() {
        if (mInstallingTask == null) {
            PackageInstaller installer = getPackageManager().getPackageInstaller();
            PackageInstaller.SessionInfo sessionInfo = installer.getSessionInfo(mSessionId);

            if (sessionInfo != null && !sessionInfo.isActive()) {
                mInstallingTask = new InstallingAsyncTask();
                mInstallingTask.execute();
            }
        }
    }
}
```

## parsePackageLite
> base/core/java/android/content/pm/parsing/ApkLiteParseUtils.java

```java
    //一种是目录，另一种是文件
    public static ParseResult<PackageLite> parsePackageLite(ParseInput input,
            File packageFile, int flags) {
        //无论哪个分支，最终都会走 parseApkLite
        if (packageFile.isDirectory()) {
            return parseClusterPackageLite(input, packageFile, flags);
        } else {
            return parseMonolithicPackageLite(input, packageFile, flags);
        }
    }

    public static ParseResult<PackageLite> parseClusterPackageLite(ParseInput input,
            File packageDir, int flags) {
        for (File file : files) {
            //XmlResourceParser: 解析 AndroidManifest.xml，versioncode、安装位置等
            //ApkAssets: 主要实现在 ApkAssets.cpp，ApkAssets.nativeLoad、ApkAssets.nativeLoadFd
            //ParsingPackageUtils.getSigningDetails：解析获取签名信息
            final ParseResult<ApkLite> result = parseApkLite(input, file, flags);
        }
    }
```

## InstallingAsyncTask

```java

    protected PackageInstaller.Session doInBackground(Void... params) {
        //把安装包数据写入
        PackageInstaller.Session session;
        File file = new File(mPackageURI.getPath());
        OutputStream out = session.openWrite("PackageInstaller", 0, sizeBytes)
        out.write(buffer, 0, numRead);
    }

    protected void onPostExecute(PackageInstaller.Session session) {
        //提交安装
        Intent broadcastIntent = new Intent(BROADCAST_ACTION);
        broadcastIntent.setPackage(getPackageName());
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                        InstallInstalling.this,
                        mInstallId,
                        broadcastIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        //提交到 PackageInstallerSession.commit 执行
            //1、启动安装流程 send message MSG_ON_SESSION_SEALED
            //2、安装前的检验 send message MSG_STREAM_VALIDATE_AND_COMMIT，handleSessionSealed、handleStreamValidateAndCommit();【apk 或 apex】
            //3、开始安装 send message MSG_INSTALL，StagingManager.commitSession，重要的安装 verify();
            //4、重启验证 PreRebootVerificationHandler.startPreRebootVerification，send message MSG_PRE_REBOOT_VERIFICATION_START，验证 apex、apk
            //5、重启验证结束，启动检查点服务 onPreRebootVerificationComplete
            //6、蒙圈了，真正安装 apk 不知道执行到哪里去了，估计是进入了 PMS，那我们就到此结束吧
            //7、通过广播回调安装结果 dispatchSessionFinished、mPm.sendSessionCommitBroadcast、mContext.sendBroadcastAsUser，一开始注册的 InstallEventReceiver 就是一个广播
        session.commit(pendingIntent.getIntentSender());
    }
```


## InstallSuccess
> base/packages/PackageInstaller/src/com/android/packageinstaller/InstallSuccess.java

```java
public class InstallSuccess extends AlertActivity {

    //如果已安装该引用，则根据包名获取 intent 并启动（是在不需要返回安装结果的情况下）
    private Intent mLaunchIntent;

    protected void onCreate(@Nullable Bundle savedInstanceState) {

        if (getIntent().getBooleanExtra(Intent.EXTRA_RETURN_RESULT, false)) {
            Intent result = new Intent();
            result.putExtra(Intent.EXTRA_INSTALL_RESULT, PackageManager.INSTALL_SUCCEEDED);
            setResult(Activity.RESULT_OK, result);
            finish();
        } else {
            Intent intent = getIntent();
            ApplicationInfo appInfo =
                    intent.getParcelableExtra(PackageUtil.INTENT_ATTR_APPLICATION_INFO);
            mAppPackageName = appInfo.packageName;
            PackageManager pm = getPackageManager();
            mLaunchIntent = getPackageManager().getLaunchIntentForPackage(mAppPackageName);
            //条件允许情况将显示打开已安装应用按钮，startActivity(mLaunchIntent);
            bindUi();
        }
    }
}
```

## InstallFailed
> base/packages/PackageInstaller/src/com/android/packageinstaller/InstallFailed.java

安装失败没有太多的其他逻辑，只会想用户展示安装失败的对话框以及说明失败原因


# verify

即将进入 PMS 开始真正的安装流程前需检验：
- verify
- verifyNonStaged
- prepareForVerification
    - makeVerificationParamsLocked
    - mPm.new VerificationParam 【安装参数验证，外部设置验证结果监听 localObserver】
- mPm.verifyStage【进入 PMS 验证】
- VerificationParams：startCopy
    - VerificationParams.handleStartCopy() 
    - handleReturnCode()
        - sendVerificationCompleteNotification
        - sendVerificationCompleteNotification
        - mObserver.onPackageInstalled【发送验证完成，回到 localObserver】
            - onVerificationComplete
            - install
            - installNonStaged
            - mPm.installStage【正式进入 PMS 开始安装】

# installStage
> base/services/core/java/com/android/server/pm/PackageManagerService.java

- installStage【发送一个 INIT_COPY 消息，由 PackageHandler 处理】
- InstallParams：params.startCopy()
    - handleStartCopy
        - overrideInstallLocation 【覆盖安装】
            - installLocationPolicy
    - handleReturnCode
        - processPendingInstall
            - copyApk【复制安装包到指定目录，根据包名创建目录】
    - tryProcessInstallRequest
    - processInstallRequestsAsync
    - doPreInstall【清理安装目录】
    - installPackagesTracedLI【安装包优化】
    - doPostInstall
    - restoreAndPostInstall
        - performBackupManagerRestore【备份】
    - send message POST_INSTALL【进行安装】
- handlePackagePostInstall
    - 