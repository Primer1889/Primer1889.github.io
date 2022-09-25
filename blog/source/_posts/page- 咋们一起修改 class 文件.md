---
title: 咋们一起修改 class 文件
catalog: true
date: 2022-09-25 20:45:24
subtitle: 修改第三方 jar 包满足当前需求，这是一种方式！
header-img: /img/220923_classmodify/class_bg.webp
tags: 字节码
categories:
sticky: 2
---

# 你有遇到适用的场景吗

![深大村长.jpg](https://img-blog.csdnimg.cn/img_convert/b489e163aa127c5f7eb59575079df4d6.png)

你有没有遇到需要修改 class 文件重新打包的场景呢？巧得很，最近刚好遇到需要修改一个已存在的 jar 包以满足当前的需求，不过本次修改的是字符常量，尚未涉及到比较复杂的逻辑，记录下此刻，如何修改？如何快速修改完成需求？希望可以抛砖引玉，剩下的较为复杂的逻辑修改就交给你们了 :)

**举个例子：**

问题描述：
    1、某弹窗文本显示不正确（文字冗余，格式不符合要求）

![image.png](https://img-blog.csdnimg.cn/img_convert/39cb62ad15a8135fced9b45bb6e0b58e.png)

关于描述：
    1、此弹窗代码是某第三方 jar 包
    2、文字显示要求应该是： `客服：QQ号`
    3、但实际情况第三方 jar 包在显示内容前加了前缀 `客服`，不符合要求

预期效果：
    1、显示效果：`客服QQ：2464113103`

![image.png](https://img-blog.csdnimg.cn/img_convert/be9836c62729cd6fd5904c8ff4dbcfd5.png)


预期需求很清晰，代码修改也跟清晰（去除第三方 jar 包内容前缀 `客服：`，实现内容灵活配置）


# 温故 jar 命令使用

1、命令查看使用帮助 jar -h
```java
用法: jar {ctxui}[vfmn0PMe] [jar-file] [manifest-file] [entry-point] [-C dir] files ...\
选项:
    -c  创建新档案
    -t  列出档案目录
    -x  从档案中提取指定的 (或所有) 文件
    -u  更新现有档案
    -v  在标准输出中生成详细输出
    -f  指定档案文件名
    -m  包含指定清单文件中的清单信息
    -n  创建新档案后执行 Pack200 规范化
    -e  为捆绑到可执行 jar 文件的独立应用程序
        指定应用程序入口点
    -0  仅存储; 不使用任何 ZIP 压缩
    -P  保留文件名中的前导 '/' (绝对路径) 和 ".." (父目录) 组件
    -M  不创建条目的清单文件
    -i  为指定的 jar 文件生成索引信息
    -C  更改为指定的目录并包含以下文件

如果任何文件为目录, 则对其进行递归处理。清单文件名, 档案文件名和入口点名称的指定顺序
与 'm', 'f' 和 'e' 标记的指定顺序相同。
```

2、打包生成 jar
将 class 文件打包为 jar 文件
```java
jar cvf classes.jar Foo.class Bar.class
```

将 folder/ 目录下的所有 class 文件打包成 jar 文件
```java
jar cvf classes.jar -C folder/ .
```

3、查看 jar 文件列表
```java
jar -tvf classes.jar
```

4、解压 jar 文件
```java
jar -xvf classes.jar
```

# 开始修改 jar

方式一不推荐，只是想让你知道这种方式也是可行的。

## 方式一：javac

**1、使用 JD-GUI 打开 jar 文件并导出 java 代码**

**2、使用 javac 命令把 .java 文件转换为 .class 文件**
```java
javac -classpath [待生成的文件名.jar] [已修改的文件.java]
```

实际操作过程中直接执行 javac 命令往往不是自己期望的那么顺利，遇到问题针对性处理。

`2.1` 当遇到编码问题时：需要添加额外参数***-encoding utf-8***

![image.png](https://img-blog.csdnimg.cn/img_convert/49f46c79b1626bc9fa8f8a326a9efa6c.png)

`2.2` 当遇到程序包找不到时：需要在***已修改.java文件同级目录下***放置缺失的 jar 包（可以使用分号分隔输入多个 jar 包参数）

![image.png](https://img-blog.csdnimg.cn/img_convert/213dbc4980626c7aa6047fec3884f4a6.png)

![image.png](https://img-blog.csdnimg.cn/img_convert/45f67a8f91ccdddbd528b08be84bb98c.png)

![image.png](https://img-blog.csdnimg.cn/img_convert/4c096fedfc8e73d0a8f5fa17702a651f.png)


`注意：`
这里有个坑，如果打包过程有依赖 android jar，要求必须是 android sdk 目录下的 jar（官方的），不能随便找一个（阉割版），否则编译失败。

![image.png](https://img-blog.csdnimg.cn/img_convert/56247e2d3f5361ead4c49454c0a7a3bd.png)

**3、最终命令（可能是这样，但不一定）**
```java
javac -encoding utf-8 -classpath [依赖的1.jar;依赖的2.jar;依赖的3.jar;...] [已修改的单个 .java 文件或者待转换的 .java 文件所在目录]
```
```java
javac -encoding utf-8 -classpath android.jar;classes-dex2jar.jar GRAppStoreActivity.java
```

这就成功把 java 代码编译为 class 代码

**4、替换旧的 class 文件并重新打包成 jar**
```java
jar cvf [新文件名.jar] -C [待打包的class文件目录] [输出到指定目录]
```
```java
jar cvf jsonlili.jar -C primer/ .
```

到这里就打包成功了，如果遇到什么问题欢迎评论 :) 如果 jar 依赖的第三方包较多，这种方式是不适合操作的，而且步骤也很繁琐，繁琐的事情必须简化，重复的工作可以流程化，那么下面简明介绍利用工具实现修改。

## 方式二：jclasslib
**1、把 jar 包拖入工具中查看代码**

或者打开某个 class 文件，对于某些简单、少量的修改也可以像方式一那样，修改、替换、重新打包生成目标 jar

![image.png](https://img-blog.csdnimg.cn/img_convert/a6fd42dda952836b3119dff2faa988bd.png)

**2、代码定位并修改**

我们以开头的客服弹窗提示为例，在原始 jar 文件中定位到`客服：`固定前缀，代码位于在 ***MyMainActivity*** 类的某个方法中

![image.png](https://img-blog.csdnimg.cn/img_convert/ff17b6d926a31e648c532263e6268792.png)

我们知道匿名类经过编译后的 class 文件是一个单独的文件，且文件名往往带有`$`符号，我们解压 jar 文件可以缩小查找范围，一番查阅后定位到 `MyMainActivity$2$1.class` 文件中，Methods -> onClick -> Code（这里需要对 class 文件结构有一定的了解）

![image.png](https://img-blog.csdnimg.cn/img_convert/b9d17fbc33b11fa541911cf6e3d21416.png)

> ldc：是 JVM 指令，指从常量池中取出字符串常量并压入操作数堆栈中。
>
> 这里有两个动作，取出数据、把数据压入操作数栈（如果不了解操作数栈，建议略读字节码相关资料）


关于 class 文件结构和字节码指令推荐官方文档： [字节码指令](https://docs.oracle.com/javase/specs/jls/se19/html/index.html)

**3、修改并保存**
从刚才的 `ldc #61 <客服：>` 中点击 `#61` 跳转到常量编辑处修改并保存

![image.png](https://img-blog.csdnimg.cn/img_convert/ec7700f218da9a6d8d57445909ea9f05.png)


到这里，其实我们对 class 文件的修改已经完成了 :)

# 最后

我在想，如果想要修改更复杂的逻辑以满足更大的需求呢？怎么办？

个人见解，那就是：**持续学习，实践输出**


1、我对 JVM 指令不熟，对修改无从下手，那么我想你应该需要进一步了解 class 文件结构，JVM 指令说明；
去哪学习？找官方资源、GitHub 学习资源、阅读大佬的文章。。。。。。

2、工具使用的掌握，上面提到的 jclasslib 就是一个字节码查看、编辑工具，工具是往往有竞品存在，
我今天使用的是 jclasslib，可随着自我视野的扩展，我明天可能在使用 Recaf（也是字节码编辑工具）


**附加：**
- [jclasslib bytecode editor](https://github.com/ingokegel/jclasslib) 
- [JD-GUI](https://github.com/java-decompiler/jd-gui/releases)
- [在线破解工具包：](https://down.52pojie.cn/Tools/)


