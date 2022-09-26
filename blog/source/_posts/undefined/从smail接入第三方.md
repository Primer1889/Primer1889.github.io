---
title: 从 smail 接入第三方 SDK
catalog: true
date: 2022-09-26 20:56:19
subtitle: 有时通过查看、修改第三方库能更好解决问题
header-img: /img/220926_smailsdk/smail_bg.webp
tags: SDK
sticky: 3
categories:
---

# 遇到过这种场景吗

什么时候要利用 smali 语言层面接入第三方 sdk ？一般都是使用 java 接口，一目了然，搞个 smali 不是没事找事？场景不同，在没有办法的时候这就是一种方法。

programer A：   发你一个 apk 文件，帮我看下
programer A：   因为我们没有原工程，只有一个 APK，我想把咋们的 sdk 接入到里面，怎么搞？
programer B：   应该可以，可以试试以字节码、smail 形式接入
programer A：   smail ？这是啥啊！
programer B：   自己查资料。。。。。。


**嗯？没有思路，不然写个 Demo 看看吧**

1、准备一个 sdk: `gcsdk-1.0.0.jar`
2、准备一个 apk: `app-0.apk`（假设是我们的应用）
3、创建一个空白 Android 项目，预备接入 sdk: `app-1.apk`（备用） 

模拟几个对外的接口简单生成一个 jar，实际中接入的第三方 sdk 接口也不会很复杂。

---

> gcsdk-1.0.0（示例） 

```java
// 初始化
GCSDK.getInstance().init(new InitCallback() {
            @Override
            public void initSuccess() {
                System.out.println("gcsdk-初始化成功");
            }
            @Override
            public void initFail(int code, String error) {
                System.out.println("gcsdk-初始化失败：code = " + code + "  error = " + error);
            }
});

//登录
GCSDK.getInstance().login(new LoginCallback() {
            @Override
            public void onLoginSuccess() {
                System.out.println("登录-成功");
            }
            @Override
            public void inLoginFail(int code, String error) {
                System.out.println("登录-失败：code = " + code + " error = " + error);
            }
});

//广告        
AdParams adParams = new AdParams();
GCSDK.getInstance().openAd(adParams, new AdCallback() {
            @Override
            public void onClick() {
                System.out.println("广告-点击");
            }
            @Override
            public void onClickSkip() {
                System.out.println("广告-点击跳过");
            }
            @Override
            public void onClose() {
                System.out.println("广告-关闭");
            }
            @Override
            public void onOpenFaild(int code, String error) {
                System.out.println("广告-打开失败：code = " + code + " error = " + error);
            }
            @Override
            public void onOpenSuccess() {
                System.out.println("广告-打开成功");
            }
            @Override
            public void onLoadBegin() {
                System.out.println("广告-加载开始");
            }
            @Override
            public void onLoadFaild(int code, String error) {
                System.out.println("广告-加载失败：code = " + code + " error = " + error);
            }
            @Override
            public void onLoadComplete() {
                System.out.println("广告-加载完成");
            }
            @Override
            public void onDownloadBegin() {
                System.out.println("广告-下载开始");
            }
            @Override
            public void onDownloadFail(int code, String error) {
                System.out.println("广告-下载失败：code =" + code + " error = " + error);
            }

            @Override
            public void onDownloadComplete() {
                System.out.println("广告-下载完成");
            }
});

//支付
PayParams payParams = new PayParams();
PayManager.getInstance().pay(payParams, new PayCallback() {
            @Override
            public void onPaySuccess() {
                System.out.println("支付-成功");
            }
            @Override
            public void onPayFail(int code, String error) {
                System.out.println("支付-失败：code = " + code + " error = " + error);
            }
});
```

> 空白 Android 项目，模拟接入 gcsdk，接入完成后打包备用，生成的 apk 用于获取 smali 代码

```java
// App.java
package com.example.gcsdkdemo;
import android.app.Application;
import android.util.Log;
import com.primer.jsonlili.callback.InitCallback;
import com.primer.jsonlili.core.GCSDK;

public class App extends Application {
    private final String TAG = "cunzhang";
    //初始化回调
    private InitCallback mInitCallback = new InitCallback() {
        @Override
        public void initSuccess() {
            Log.d(TAG, "initSuccess: ");
        }

        @Override
        public void initFail(int i, String s) {
            Log.d(TAG, "initFail: ");
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        //gcsdk 初始化
        GCSDK.getInstance().init(mInitCallback);
    }
}
```
```java
//MainActivity.java
package com.example.gcsdkdemo;
import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import com.primer.jsonlili.callback.AdCallback;
import com.primer.jsonlili.callback.LoginCallback;
import com.primer.jsonlili.callback.PayCallback;
import com.primer.jsonlili.core.GCSDK;
import com.primer.jsonlili.params.AdParams;
import com.primer.jsonlili.params.PayParams;

public class MainActivity extends AppCompatActivity {
    private final String TAG = "cunzhang";
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }

    public void onPay(View view) {
        Log.d(TAG, "onPay: ");
        //支付接口
        PayParams payParams = new PayParams();
        GCSDK.getInstance().pay(payParams, new PayCallback() {
            @Override
            public void onPaySuccess() {
                Log.d(TAG, "onPaySuccess: ");
            }
            @Override
            public void onPayFail(int i, String s) {
                Log.d(TAG, "onPayFail: ");
            }
        });
    }

    public void onLogin(View view) {
        Log.d(TAG, "onLogin: ");
        //登录接口
        GCSDK.getInstance().login(new LoginCallback() {
            @Override
            public void onLoginSuccess() {
                Log.d(TAG, "onLoginSuccess: ");
            }
            @Override
            public void inLoginFail(int i, String s) {
                Log.d(TAG, "inLoginFail: ");
            }
        });
    }
    
    public void onOpenAd(View view) {
        Log.d(TAG, "onOpenAd: ");
        //广告接口
        AdParams adParams = new AdParams();
        GCSDK.getInstance().openAd(adParams, new AdCallback() {
            @Override
            public void onClick() {
                Log.d(TAG, "onClick: ");
            }
            @Override
            public void onClickSkip() {
                Log.d(TAG, "onClickSkip: ");
            }
            @Override
            public void onClose() {
                Log.d(TAG, "onClose: ");
            }
            @Override
            public void onOpenFaild(int i, String s) {
                Log.d(TAG, "onOpenFaild: ");
            }
            @Override
            public void onOpenSuccess() {
                Log.d(TAG, "onOpenSuccess: ");
            }
            @Override
            public void onLoadBegin() {
                Log.d(TAG, "onLoadBegin: ");
            }
            @Override
            public void onLoadFaild(int i, String s) {
                Log.d(TAG, "onLoadFaild: ");
            }
            @Override
            public void onLoadComplete() {
                Log.d(TAG, "onLoadComplete: ");
            }
            @Override
            public void onDownloadBegin() {
                Log.d(TAG, "onDownloadBegin: ");
            }
            @Override
            public void onDownloadFail(int i, String s) {
                Log.d(TAG, "onDownloadFail: ");
            }
            @Override
            public void onDownloadComplete() {
                Log.d(TAG, "onDownloadComplete: ");
            }
        });
    }
}
```

依次触发按钮点击事件

![image.png](https://img-blog.csdnimg.cn/img_convert/f13a6793367598f0a03c93cb84c3a781.png)

假设这是咋们的应用，接着要预备接入

![image.png](https://img-blog.csdnimg.cn/img_convert/c999c536a59d0ae7df378a1c36b140f6.png)


# 了解下 smali

**1、获得 smali**
两个安装包的代码都要反编译获得 

```java
java -jar apktool_2.6.0.jar [-r] d app-0.apk

java -jar apktool_2.6.0.jar [-r] d app-1.apk
```

我们的应用

![image.png](https://img-blog.csdnimg.cn/img_convert/f45e85873cea6435fddc0548f82af6ee.png)

空白项目模拟 Java 接口模拟接入

![image.png](https://img-blog.csdnimg.cn/img_convert/b6ff5a0f01ab90cb1132849cb6d138f0.png)

**2、了解项目的 smali**

可以使用 VSCode 插件 smali、smali2java 方便查看 smali 代码，以下 smali 主要是列举与 sdk 相关，了解 smali 具体实现

```java
//App.java & App.smal
package com.example.gcsdkdemo;
import android.app.Application;
import android.util.Log;
import com.primer.jsonlili.callback.InitCallback;
import com.primer.jsonlili.core.GCSDK;

public class App extends Application {
    private final String TAG = "cunzhang"; 

    //定义属性 mInitCallback：      .field private mInitCallback:Lcom/primer/jsonlili/callback/InitCallback;
    //创建对象：                    new-instance v0, Lcom/example/gcsdkdemo/App$1;
    //调用类隐藏初始化方法 <init>：   invoke-direct {v0, p0}, Lcom/example/gcsdkdemo/App$1;-><init>(Lcom/example/gcsdkdemo/App;)V
    //把创建的对象赋值给本地变量：     iput-object v0, p0, Lcom/example/gcsdkdemo/App;->mInitCallback:Lcom/primer/jsonlili/callback/InitCallback;
    private InitCallback mInitCallback = new InitCallback() {
        @Override
        public void initSuccess() {
            Log.d(TAG, "initSuccess: ");
        }
        @Override
        public void initFail(int i, String s) {
            Log.d(TAG, "initFail: ");
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        
        //调用类的静态方法：         invoke-static {}, Lcom/primer/jsonlili/core/GCSDK;->getInstance()Lcom/primer/jsonlili/core/GCSDK;
        //移动操作数：              move-result-object v0
        //从操作数栈获取两个操作数：  iget-object v1, p0, Lcom/example/gcsdkdemo/App;->mInitCallback:Lcom/primer/jsonlili/callback/InitCallback;
        //调用实现方法：            invoke-virtual {v0, v1}, Lcom/primer/jsonlili/core/GCSDK;->init(Lcom/primer/jsonlili/callback/InitCallback;)V
        GCSDK.getInstance().init(mInitCallback);
    }
}
```

InitCallback 内部类实现

```java
# 表明类限定名
.class Lcom/example/gcsdkdemo/App$1;
# 父类
.super Ljava/lang/Object;
# 源文件名称
.source "App.java"

# interfaces
.implements Lcom/primer/jsonlili/callback/InitCallback;

# annotations
.annotation system Ldalvik/annotation/EnclosingClass;
value = Lcom/example/gcsdkdemo/App;
.end annotation

# 内部类
.annotation system Ldalvik/annotation/InnerClass;
accessFlags = 0x0
name = null
.end annotation

# 内部类持有外部类 this 引用
# instance fields
.field final synthetic this$0:Lcom/example/gcsdkdemo/App;

# direct methods
.method constructor <init>(Lcom/example/gcsdkdemo/App;)V
.locals 0
.param p1, "this$0" # Lcom/example/gcsdkdemo/App;
# 行数，删除不影响代码执行
.line 13
iput-object p1, p0, Lcom/example/gcsdkdemo/App$1;->this$0:Lcom/example/gcsdkdemo/App;
invoke-direct {p0}, Ljava/lang/Object;-><init>()V
return-void
.end method

# virtual methods
.method public initFail(ILjava/lang/String;)V

# 指定方法中可用的非参寄存器数量
.locals 2
.param p1, "i" # I
.param p2, "s" # Ljava/lang/String;
.line 21
const-string v0, "cunzhang"
const-string v1, "initFail: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 22
return-void
.end method

.method public initSuccess()V
.locals 2
.line 16
const-string v0, "cunzhang"
const-string v1, "initSuccess: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 17
return-void
.end method
```

```java
//MainActivity.java $ MainActivity.smali
package com.example.gcsdkdemo;
import androidx.appcompat.app.AppCompatActivity;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import com.primer.jsonlili.callback.AdCallback;
import com.primer.jsonlili.callback.LoginCallback;
import com.primer.jsonlili.callback.PayCallback;
import com.primer.jsonlili.core.GCSDK;
import com.primer.jsonlili.params.AdParams;
import com.primer.jsonlili.params.PayParams;

public class MainActivity extends AppCompatActivity {
    private final String TAG = "cunzhang";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }

    public void onPay(View view) {
        Log.d(TAG, "onPay: ");
        //创建 PayParams 对象并存储到 v0，
        //new-instance v0, Lcom/primer/jsonlili/params/PayParams;
        //invoke-direct {v0}, Lcom/primer/jsonlili/params/PayParams;-><init>()V
        
        //.local v0, "payParams":Lcom/primer/jsonlili/params/PayParams;
        //invoke-static {}, Lcom/primer/jsonlili/core/GCSDK;->getInstance()Lcom/primer/jsonlili/core/GCSDK;
        //move-result-object v1
        //new-instance v2, Lcom/example/gcsdkdemo/MainActivity$1;
        //invoke-direct {v2, p0}, Lcom/example/gcsdkdemo/MainActivity$1;-><init>(Lcom/example/gcsdkdemo/MainActivity;)V
        //invoke-virtual {v1, v0, v2}, Lcom/primer/jsonlili/core/GCSDK;->pay(Lcom/primer/jsonlili/params/PayParams;Lcom/primer/jsonlili/callback/PayCallback;)V
        
        PayParams payParams = new PayParams();
        GCSDK.getInstance().pay(payParams, new PayCallback() {
            @Override
            public void onPaySuccess() {
                Log.d(TAG, "onPaySuccess: ");
            }

            @Override
            public void onPayFail(int i, String s) {
                Log.d(TAG, "onPayFail: ");
            }
        });
    }

    public void onLogin(View view) {
        Log.d(TAG, "onLogin: ");
        //调用 getInstance，把 getInstance 返回的对象存储到 v0，创建内部类 LoginCallback 对象，调用内部类初始化，调用登录方法
        //invoke-static {}, Lcom/primer/jsonlili/core/GCSDK;->getInstance()Lcom/primer/jsonlili/core/GCSDK;
        //move-result-object v0
        //new-instance v1, Lcom/example/gcsdkdemo/MainActivity$2;
        //invoke-direct {v1, p0}, Lcom/example/gcsdkdemo/MainActivity$2;-><init>(Lcom/example/gcsdkdemo/MainActivity;)V
        //invoke-virtual {v0, v1}, Lcom/primer/jsonlili/core/GCSDK;->login(Lcom/primer/jsonlili/callback/LoginCallback;)V
        
        GCSDK.getInstance().login(new LoginCallback() {
            @Override
            public void onLoginSuccess() {
                Log.d(TAG, "onLoginSuccess: ");
            }

            @Override
            public void inLoginFail(int i, String s) {
                Log.d(TAG, "inLoginFail: ");
            }
        });
    }
    

    public void onOpenAd(View view) {
        Log.d(TAG, "onOpenAd: ");
        
        //new-instance v0, Lcom/primer/jsonlili/params/AdParams;
        //invoke-direct {v0}, Lcom/primer/jsonlili/params/AdParams;-><init>()V
        //.line 60
        //.local v0, "adParams":Lcom/primer/jsonlili/params/AdParams;
        //invoke-static {}, Lcom/primer/jsonlili/core/GCSDK;->getInstance()Lcom/primer/jsonlili/core/GCSDK;
        //move-result-object v1
        //new-instance v2, Lcom/example/gcsdkdemo/MainActivity$3;
        //invoke-direct {v2, p0}, Lcom/example/gcsdkdemo/MainActivity$3;-><init>(Lcom/example/gcsdkdemo/MainActivity;)V
        //invoke-virtual {v1, v0, v2}, Lcom/primer/jsonlili/core/GCSDK;->openAd(Lcom/primer/jsonlili/params/AdParams;Lcom/primer/jsonlili/callback/AdCallback;)V

        AdParams adParams = new AdParams();
        GCSDK.getInstance().openAd(adParams, new AdCallback() {
            @Override
            public void onClick() {
                Log.d(TAG, "onClick: ");
            }
            @Override
            public void onClickSkip() {
                Log.d(TAG, "onClickSkip: ");
            }
            @Override
            public void onClose() {
                Log.d(TAG, "onClose: ");
            }
            @Override
            public void onOpenFaild(int i, String s) {
                Log.d(TAG, "onOpenFaild: ");
            }
            @Override
            public void onOpenSuccess() {
                Log.d(TAG, "onOpenSuccess: ");
            }
            @Override
            public void onLoadBegin() {
                Log.d(TAG, "onLoadBegin: ");
            }
            @Override
            public void onLoadFaild(int i, String s) {
                Log.d(TAG, "onLoadFaild: ");
            }
            @Override
            public void onLoadComplete() {
                Log.d(TAG, "onLoadComplete: ");
            }
            @Override
            public void onDownloadBegin() {
                Log.d(TAG, "onDownloadBegin: ");
            }
            @Override
            public void onDownloadFail(int i, String s) {
                Log.d(TAG, "onDownloadFail: ");
            }
            @Override
            public void onDownloadComplete() {
                Log.d(TAG, "onDownloadComplete: ");
            }
        });
    }
}
```

PayCallback 内部类实现

```java
.class Lcom/example/gcsdkdemo/MainActivity$1;
.super Ljava/lang/Object;
.source "MainActivity.java"

# interfaces
.implements Lcom/primer/jsonlili/callback/PayCallback;

# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
value = Lcom/example/gcsdkdemo/MainActivity;->onPay(Landroid/view/View;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
accessFlags = 0x0
name = null
.end annotation

# instance fields
.field final synthetic this$0:Lcom/example/gcsdkdemo/MainActivity;

# direct methods
.method constructor <init>(Lcom/example/gcsdkdemo/MainActivity;)V
.locals 0
.param p1, "this$0" # Lcom/example/gcsdkdemo/MainActivity;
.line 28
iput-object p1, p0, Lcom/example/gcsdkdemo/MainActivity$1;->this$0:Lcom/example/gcsdkdemo/MainActivity;
invoke-direct {p0}, Ljava/lang/Object;-><init>()V
return-void
.end method

# virtual methods
.method public onPayFail(ILjava/lang/String;)V
.locals 2
.param p1, "i" # I
.param p2, "s" # Ljava/lang/String;
.line 36
const-string v0, "cunzhang"
const-string v1, "onPayFail: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 37
return-void
.end method

.method public onPaySuccess()V
.locals 2
.line 31
const-string v0, "cunzhang"
const-string v1, "onPaySuccess: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 32
return-void
.end method
```

内部类 LoginCallback 实现

```java
.class Lcom/example/gcsdkdemo/MainActivity$2;
.super Ljava/lang/Object;
.source "MainActivity.java"

# interfaces
.implements Lcom/primer/jsonlili/callback/LoginCallback;

# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
value = Lcom/example/gcsdkdemo/MainActivity;->onLogin(Landroid/view/View;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
accessFlags = 0x0
name = null
.end annotation

# instance fields
.field final synthetic this$0:Lcom/example/gcsdkdemo/MainActivity;

# direct methods
.method constructor <init>(Lcom/example/gcsdkdemo/MainActivity;)V
.locals 0
.param p1, "this$0" # Lcom/example/gcsdkdemo/MainActivity;
.line 43
iput-object p1, p0, Lcom/example/gcsdkdemo/MainActivity$2;->this$0:Lcom/example/gcsdkdemo/MainActivity;
invoke-direct {p0}, Ljava/lang/Object;-><init>()V
return-void
.end method

# virtual methods
.method public inLoginFail(ILjava/lang/String;)V
.locals 2
.param p1, "i" # I
.param p2, "s" # Ljava/lang/String;
.line 51
const-string v0, "cunzhang"
const-string v1, "inLoginFail: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 52
return-void
.end method

.method public onLoginSuccess()V
.locals 2
.line 46
const-string v0, "cunzhang"
const-string v1, "onLoginSuccess: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 47
return-void
.end method
```

AdCallback 内部类实现

```java
.class Lcom/example/gcsdkdemo/MainActivity$3;
.super Ljava/lang/Object;
.source "MainActivity.java"

# interfaces
.implements Lcom/primer/jsonlili/callback/AdCallback;

# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
value = Lcom/example/gcsdkdemo/MainActivity;->onOpenAd(Landroid/view/View;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
accessFlags = 0x0
name = null
.end annotation

# instance fields
.field final synthetic this$0:Lcom/example/gcsdkdemo/MainActivity;

# direct methods
.method constructor <init>(Lcom/example/gcsdkdemo/MainActivity;)V
.locals 0
.param p1, "this$0" # Lcom/example/gcsdkdemo/MainActivity;
.line 60
iput-object p1, p0, Lcom/example/gcsdkdemo/MainActivity$3;->this$0:Lcom/example/gcsdkdemo/MainActivity;
invoke-direct {p0}, Ljava/lang/Object;-><init>()V
return-void
.end method

# virtual methods
.method public onClick()V
.locals 2
.line 63
const-string v0, "cunzhang"
const-string v1, "onClick: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 64
return-void
.end method

.method public onClickSkip()V
.locals 2
.line 68
const-string v0, "cunzhang"
const-string v1, "onClickSkip: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 69
return-void
.end method

.method public onClose()V
.locals 2
.line 73
const-string v0, "cunzhang"
const-string v1, "onClose: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 74
return-void
.end method

.method public onDownloadBegin()V
.locals 2
.line 103
const-string v0, "cunzhang"
const-string v1, "onDownloadBegin: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 104
return-void
.end method

.method public onDownloadComplete()V
.locals 2
.line 113
const-string v0, "cunzhang"
const-string v1, "onDownloadComplete: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 114
return-void
.end method

.method public onDownloadFail(ILjava/lang/String;)V
.locals 2
.param p1, "i" # I
.param p2, "s" # Ljava/lang/String;
.line 108
const-string v0, "cunzhang"
const-string v1, "onDownloadFail: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 109
return-void
.end method

.method public onLoadBegin()V
.locals 2
.line 88
const-string v0, "cunzhang"
const-string v1, "onLoadBegin: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 89
return-void
.end method

.method public onLoadComplete()V
.locals 2
.line 98
const-string v0, "cunzhang"
const-string v1, "onLoadComplete: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 99
return-void
.end method

.method public onLoadFaild(ILjava/lang/String;)V
.locals 2
.param p1, "i" # I
.param p2, "s" # Ljava/lang/String;
.line 93
const-string v0, "cunzhang"
const-string v1, "onLoadFaild: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 94
return-void
.end method

.method public onOpenFaild(ILjava/lang/String;)V
.locals 2
.param p1, "i" # I
.param p2, "s" # Ljava/lang/String;
.line 78
const-string v0, "cunzhang"
const-string v1, "onOpenFaild: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 79
return-void
.end method

.method public onOpenSuccess()V
.locals 2
.line 83
const-string v0, "cunzhang"
const-string v1, "onOpenSuccess: "
invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
.line 84
return-void
.end method
```

熟能生巧，这样的代码看多了自然了解和认识的语法等也会越多，读取来就没那么费劲


**我们的应用**

假如我们已知代码插入点位置————对应按钮的点击事件，那么我们更应该关注的是`找到对应按钮的点击事件所在位置并插入新的 smali 代码`，插入代码不能引入新的编译器等错误

![image.png](https://img-blog.csdnimg.cn/img_convert/44d85c0db3e3955ffbe9fb8d82b82f72.png)

# 试着接入 smali 

**1、把 sdk 相关的 smali 代码复制到我们应用反编译后的工程目录下**

这里我新建 `smali_classes9` 目录，gcsdk 比较简单，只有代码没有资源、so 文件等；如果有，也需要复制到工程的相应目录下，确保项目能够编译成功、运行期间能找到路径正确加载代码，这是项目能够运行的前提。

![image.png](https://img-blog.csdnimg.cn/img_convert/42ce50c1f4987d6caf1dadbb4b1ba80a.png)

下面就开始往应用中插入点处插入 sdk smali 代码。

**2、LeaderApp.java & LeaderApp.smali**
```java
.class public Lcom/example/leaderapp/ui/LeaderApp;
.super Landroid/app/Application;
.source "LeaderApp.java"

# instance fields
.field private final TAG:Ljava/lang/String;
# 1、定义初始化回调字段 
.field private mInitCallback:Lcom/primer/jsonlili/callback/InitCallback;

# direct methods
.method public constructor <init>()V
 .locals 1
 .line 6
 invoke-direct {p0}, Landroid/app/Application;-><init>()V
 .line 7
 const-string v0, "leader"
 iput-object v0, p0, Lcom/example/leaderapp/ui/LeaderApp;->TAG:Ljava/lang/String;
# 2、初始化方法中创建内部类对象
 new-instance v0, Lcom/example/leaderapp/ui/LeaderApp$1;
 invoke-direct {v0, p0}, Lcom/example/leaderapp/ui/LeaderApp$1;-><init>(Lcom/example/leaderapp/ui/LeaderApp;)V
 iput-object v0, p0, Lcom/example/leaderapp/ui/LeaderApp;->mInitCallback:Lcom/primer/jsonlili/callback/InitCallback;
 return-void
.end method

# virtual methods
.method public onCreate()V
 .locals 2
 .line 11
 invoke-super {p0}, Landroid/app/Application;->onCreate()V
 .line 12
 const-string v0, "leader"
 const-string v1, "onCreate: "
 invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
# 3、调用初始化方法
 invoke-static {}, Lcom/primer/jsonlili/core/GCSDK;->getInstance()Lcom/primer/jsonlili/core/GCSDK;
 move-result-object v0
 iget-object v1, p0, Lcom/example/leaderapp/ui/LeaderApp;->mInitCallback:Lcom/primer/jsonlili/callback/InitCallback;
 invoke-virtual {v0, v1}, Lcom/primer/jsonlili/core/GCSDK;->init(Lcom/primer/jsonlili/callback/InitCallback;)V
 return-void
.end method
# 4、创建 LeaderApp$1.smali，并更新路径、类等
```

检验插入是否正确并符合期望，可使用 VSCODE smali 插件通过代码转换验证

![image.png](https://img-blog.csdnimg.cn/img_convert/4c945faf21ac85feb9392dbba3f9f527.png)

对比原始项目和插入后的效果是否一致

![image.png](https://img-blog.csdnimg.cn/img_convert/36199a2e95b678da1afe678f4f9ed9f3.png)

对安装包手动签名，运行查看日志，能看到 sdk 初始化正确，说明上述接入是无误的。

jarsigner -verbose -keystore [aa.keystore] [sign-app0.apk] [app-0.apk] key0

![image.png](https://img-blog.csdnimg.cn/img_convert/d9a2aa7640b31bea5158a5c79d08c34b.png)


**注意⚠️：**

反编译使用 `java -jar apktool.jar d ***.apk`，在回编译时候可能出现错误，日志中发现 `res/` 目录像是资源问题。

```java
W: invalid resource directory name: >/Users/jsonli/Desktop/demo/0603/app-0/app-0/res navigation
brut.androlib.AndrolibException: brut.common.BrutException: could not exec (exit code = 1):
/Users/jsonli/Library/apktool/framework/1.apk, -S, 
/Users/jsonli/Desktop/demo/0603/app-0/app-0/res, -M, 
/Users/jsonli/Desktop/demo/0603/app-0/app-0/AndroidManifest.xml]
```

尝试在反编译时不处理资源命令加上 -r 参数`java -jar apktool.jar -r d ***.apk` 果然能够正常打包，继续完成剩下的接入吧 :)

**3、HomeFragment$1.smali、HomeFrgment$2.smali**

`HomeFragment$1.smali`: button 点击事件实现类，登录调用处
`HomeFragment$2.smali`: gcsdk 登录回调

```java
.class Lcom/example/leaderapp/ui/home/HomeFragment$1;
.super Ljava/lang/Object;
.source "HomeFragment.java"

# interfaces
.implements Landroid/view/View$OnClickListener;

# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
 value = Lcom/example/leaderapp/ui/home/HomeFragment;->onCreateView(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)Landroid/view/View;
.end annotation
.annotation system Ldalvik/annotation/InnerClass;
 accessFlags = 0x0
 name = null
.end annotation

# instance fields
.field final synthetic this$0:Lcom/example/leaderapp/ui/home/HomeFragment;

# direct methods
.method constructor <init>(Lcom/example/leaderapp/ui/home/HomeFragment;)V
 .locals 0
 .param p1, "this$0" # Lcom/example/leaderapp/ui/home/HomeFragment;
 .line 40
 iput-object p1, p0, Lcom/example/leaderapp/ui/home/HomeFragment$1;->this$0:Lcom/example/leaderapp/ui/home/HomeFragment;
 invoke-direct {p0}, Ljava/lang/Object;-><init>()V
 return-void
.end method

# virtual methods
.method public onClick(Landroid/view/View;)V
 .locals 3
 .param p1, "view" # Landroid/view/View;
 .line 43
 invoke-virtual {p1}, Landroid/view/View;->getContext()Landroid/content/Context;
 move-result-object v0
 const-string v1, "\u767b\u5f55"
 const/4 v2, 0x0
 invoke-static {v0, v1, v2}, Landroid/widget/Toast;->makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;
 move-result-object v0
 invoke-virtual {v0}, Landroid/widget/Toast;->show()V
 .line 44
 const-string v0, "leader"
 const-string v1, "onClick: login"
 invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I

# 1、调用登录接口，修改类路径、内部类（登录回调实现类）
 invoke-static {}, Lcom/primer/jsonlili/core/GCSDK;->getInstance()Lcom/primer/jsonlili/core/GCSDK;
 move-result-object v0
 new-instance v1, Lcom/example/leaderapp/ui/home/HomeFragment$2;
 
# 内部类持有外部类引用，这里的外部类是 button 的点击事件实现类，因此传入 HomeFragment$1，而不是 HomeFragment
 invoke-direct {v1, p0}, Lcom/example/leaderapp/ui/home/HomeFragment$2;-><init>(Lcom/example/leaderapp/ui/home/HomeFragment$1;)V
 invoke-virtual {v0, v1}, Lcom/primer/jsonlili/core/GCSDK;->login(Lcom/primer/jsonlili/callback/LoginCallback;)V
 return-void
.end method
```
```java
.class Lcom/example/leaderapp/ui/home/HomeFragment$2;
.super Ljava/lang/Object;
.source "HomeFragment.java"

# 2、创建内部类文件，并把对应的登录回调代码复制过来
# 3、修改类路径 .class、.source、
# interfaces
.implements Lcom/primer/jsonlili/callback/LoginCallback;

# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
 value = Lcom/example/leaderapp/ui/home/HomeFragment;->onLogin(Landroid/view/View;)V
.end annotation
.annotation system Ldalvik/annotation/InnerClass;
 accessFlags = 0x0
 name = null
.end annotation

# 这里传入的外部类是 button 点击事件实现类，因此初始化函数和 this 类型应该是 
# instance fields
.field final synthetic this$0:Lcom/example/leaderapp/ui/home/HomeFragment$1;

# direct methods
.method constructor <init>(Lcom/example/leaderapp/ui/home/HomeFragment$1;)V
 .locals 0
 .param p1, "this$0"
 
# 这里也是 HomeFragment$1
 iput-object p1, p0, Lcom/example/leaderapp/ui/home/HomeFragment$2;->this$0:Lcom/example/leaderapp/ui/home/HomeFragment$1;
 invoke-direct {p0}, Ljava/lang/Object;-><init>()V
 return-void
.end method

# virtual methods
.method public inLoginFail(ILjava/lang/String;)V
 .locals 2
 .param p1, "i" # I
 .param p2, "s" # Ljava/lang/String;
 .line 51
 const-string v0, "cunzhang"
 const-string v1, "inLoginFail: "
 invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
 .line 52
 return-void
.end method

.method public onLoginSuccess()V
 .locals 2
 .line 46
 const-string v0, "cunzhang"
 const-string v1, "onLoginSuccess: "
 invoke-static {v0, v1}, Landroid/util/Log;->d(Ljava/lang/String;Ljava/lang/String;)I
 .line 47
 return-void
.end method
```

**4、NotificationsFragment.smali、DashboardFragment.smali**

因为代码简单，且逻辑一致，剩下的支付和广告接口代码就不贴了

# 最后的最后

`0、`获取 smail 代码（一般是根据 java 代码获取 smail 代码，同理根据 java 代码获取字节码，在代码量多的时候较难直接写出完整的 smail、字节码）
`1、`寻找插入点，smali 代码插入、保存、插入检验
`2、`打包、签名、运行调试查看效果（依此点击按钮，触发点击事件，运行结果和预期一致）

![image.png](https://img-blog.csdnimg.cn/img_convert/831157f13e5c535bafa42839e3f80257.png)


思考：

A：为什么搞 smali 接入，这不是给自己找坑嘛
B：这是需求，为了解决问题；我觉得重点是可以扩展知识
A：既然你已有 apk，可以把它转换为 java 代码，在 java 代码上接入不更清晰、省事，避免盲区不好吗，还是不方便
B：好像...也 可 以❓
A：我觉得可以，AndroidFk 工具可以把 apk 直接反编译为 android 项目（若加固、加密的 apk 可能就没那么容易，那是另一个话题了）
B：也是，在 java 代码上接入方便多了
A：我又有疑问了：如果接入的第三方 sdk 是一个 aar资源文件（包含资源等文件） 而不是 jar（纯 Java 代码），接入会不会遇到其他问题
B：区别肯定是有，实操方知晓
A：下次你来一个试试
B：... ...
A：这不可怕啊，持续学习，提升广度办法总比困难多
