---
title: 了解了解 Class 字节码
catalog: true
date: 2022-10-16 13:40:49
subtitle: 基础不牢，摇头抓挠
header-img: /img/2210/page-native.jpg
tags: 字节码
categories:
---

# 字节码 Class
 
> [关于 class 字节码](https://docs.oracle.com/javase/specs/jvms/se11/html/index.html)

## Java 虚拟机结构

**1、class 文件格式**
class 文件格式定义了类和接口的表示形式。

**2、数据类型**
主要包括两种数据类型`原始类型、引用类型`。类型检查在运行时之前，编译器进行类型检查。
&emsp;&emsp;2.1、原始类型
原始类型包括整形、浮点类型、布尔类型，jvm 中布尔类型使用整型 true=1  false=0 表示。
&emsp;&emsp;2.2、引用类型
引用类型包括类类型、数组类型和接口类型，引用类型可以是 null，默认也是 null，可以转换为任意类型。

**3、运行时数据**
&emsp;&emsp;3.1、程序计数器（pc 寄存器)
每个线程创建时都可以拥有的，当执行 Java 方法时该寄存器存放的是当前正在执行的 jvm 指令地址，当执行 native 方法时不存放值。
&emsp;&emsp;3.2、虚拟机堆栈
每个线程创建时都可以拥有的，存储局部变量和中间计算结果，常用在方法调用和返回。
&emsp;&emsp;3.3、堆
在虚拟机启动时创建所有线程共享，主要分配给类实例和数组，堆的对象存储由垃圾收集器回收。
&emsp;&emsp;3.4、方法区
在虚拟机启动时创建所有线程共享，在逻辑上是堆的一部分，存储类结构信息。
&emsp;&emsp;3.5、运行时常量池
主要存储包括编译时已知的数字、字符和运行时需要解析的方法、字段引用符号。
&emsp;&emsp;3.6、native 方法堆栈
每个线程创建时分配，服务于非 Java 语言实现 jvm 指令集解析。

**4、栈帧**
每次方法调用时都会创建帧，当方法正常执行完成或异常退出方法时帧都会被销毁，帧的创建从虚拟机堆栈中分配内存（3.2），每个帧拥有自己的局部变量数组、操作数堆栈、当前方法运行时常量的引用。局部变量数组和操作数组的大小在编译时确定，当前执行的方法帧属于活跃状态又叫当前帧，对局部变量数组和操作数堆栈的操作都在当前帧上进行。
&emsp;&emsp;4.1、局部变量
方法内使用到的值被存储在局部变量数组中，⚠️注意 long、double 类型的值占用两个连续的局部变量，其他类型占用一个，在非静态方法中局部变量数组索引 0 的值表示当前对象的 this 引用。
&emsp;&emsp;4.2、操作数堆栈
常用于辅助计算。把要操作的数据（常量、局部变量值）推送到操作数栈，jvm 指令从操作数栈获取操作数进行操作（计算），再把操作结果推送到操作数栈上。
&emsp;&emsp;4.3、动态链接
当前帧包含当前方法类型的运行时常量引用（方法类型常量就是一字符串，存储在常量池中），支持方法的解析并能正确链接。
&emsp;&emsp;4.4、方法返回
如果方法正常执行完成，如果有返回值，则把返回值推送到调用该方法的帧操作数堆栈顶部；如果方法执行过程中出现异常并且内部没有捕获异常（try），那么不会向调用者返回值。

**5、特殊方法**
&emsp;&emsp;5.1、实例初始化方法 `<init>`
该方法的声明和使用受 jvm 的限制，无需外部调用。
&emsp;&emsp;5.2、类初始化方法 `<clinit>`
无需外部调用。

**6、其他说明**
1、指令注记符：
i - int
l - ong
s - short
b - byte
c - char
f - float
d - double
a - reference
[ - array

2、加载和存储：
通常包含 `load` 相关指令表示`把本地变量加载到操作数堆栈`，通常包含 `store` 相关指令表示`把值从操作数堆栈存储到本地变量`，还有部分指定表示`将常量加载到操作数堆栈`。

3、算数指令：
算数指令通常是从操作数堆栈获取两个操作数进行计算，然后把计算结果推送到操作数堆栈顶部。

4、操作数堆栈管理：
表示可以直接操作操作数堆栈的指令，如 dup 复制一份栈顶数据。

5、其他常用指令：
new —— 创建对象
newarray —— 创建数组
f2i —— 浮点型转整型
getstatic —— 访问静态字段
instanceof —— 检查类实例
checkcast —— 检查数组
ifeq —— 条件分支
goto —— 无条件分支
invokevirtual —— 调用对象实例方法
invokeinterface —— 调用接口方法
invokespecial —— 调用实例初始化方法、当前类方法、超类方法
invokestatic —— 调用静态方法
invokedynamic —— 动态调用

## Java 虚拟机编译

**1、每一条字节码**
&emsp;&emsp;格式：`<当前方法操作码指令索引> <操作码注记符> [[可选的操作数1] ...] [可选的注释]`
&emsp;&emsp;例子：8 bipush 100 //把常量 100 推送到操作数堆栈顶部

**2、访问运行时常量池**
ldc/ldc_w —— 访问 double、long 以为类型的运行时常量值（可以访问 string 类型）
ldc2_w —— 访问 double、long 类型的值（占两个连续的局部变量）
iconst —— 通常用于访问字面值较小的整型常量值
fcmpl —— float 浮点型比较
dcmpl —— double 

**3、方法参数**
⚠️注意局部变量表大小以及使用的 iload 指令区别，关键是非静态的实例方法局部变量表内第一个索引处是当前对象 this 引用。
```java
//非静态方法
public int addA(int i,int j){
    return i+j;
}

//对应字节码
public int addA(int, int);
    descriptor: (II)I
    flags: ACC_PUBLIC
    Code:
      stack=2, locals=3, args_size=3
         0: iload_1
         1: iload_2
         2: iadd
         3: ireturn
      LineNumberTable:
        line 9: 0
```

```java
//静态方法
public static int addB(int i,int j){
    return i+j;
}

//对应字节码
public static int addB(int, int);
    descriptor: (II)I
    flags: ACC_PUBLIC, ACC_STATIC
    Code:
      stack=2, locals=2, args_size=2
         0: iload_0
         1: iload_1
         2: iadd
         3: ireturn
      LineNumberTable:
        line 13: 0
```

上述知识列举一小部分，更多详细内容可以参考官方文档，比如还有方法调用、创建类对象、创建数组、switch int、switch string、try 异常、throw 异常、finally 等。


## class 文件格式

**1、基本组成结构**

```java
ClassFile {
    u4             magic;         //class 文件格式编码 0xCAFEBABE
    u2             minor_version; //次版本 m
    u2             major_version; //主版本 M
                                  //class 文件格式版本：M.m

    u2             constant_pool_count;                   //常量池大小
    cp_info        constant_pool[constant_pool_count-1];  //常量池数组
    u2             access_flags;                          //访问权限标识 
                  
                  //public\final\super\interface\abstract
                  //synthetic\annomation\enum\module

    u2             this_class;                    //当前类，CONSTANT_Class_info
    u2             super_class;                   //父类，CONSTANT_Class_info
    u2             interfaces_count;              //接口数量
    u2             interfaces[interfaces_count];  //接口数组，CONSTANT_Class_info

    u2             fields_count;                  //字段数量，包括静态变量和实例变量
    field_info     fields[fields_count];          //字段数组，元素结构 field_info
    u2             methods_count;                 //方法数量
    method_info    methods[methods_count];        //方法数组，元素结构 method_info
    u2             attributes_count;              //属性个数
    attribute_info attributes[attributes_count];  //属性数组，元素结构 attribute_info
}
```


**2、描述符**

> 完全限定形式：字节码中类和接口名称表现形式，如 java.lang.String 表示为 Ljava/lang/String;

- 字段类型字符串描述
```java
B byte    字节
C char    字符
D double    双精度
F float   单精度
I int   整数
J long    长整数
L 类名;   对象（必须紧跟分号）
S short   短整型
Z boolean   布尔
[ reference   一维数组（多个 [ 表示多维数组）
```

- 方法类型字符串描述（包括参数类型、返回值类型）
```java
//方法
String append(int age,String name){}

//方法类型签名
(ILjava/lang/String;)Ljava/lang/String;
```

**3、常量池**
> cp_info {
&emsp;u1 tag; 
&emsp;u1 info[];
}

标签：
```java
CONSTANT_Utf8	1	
CONSTANT_Integer	3	
CONSTANT_Float	4	
CONSTANT_Long	5	
CONSTANT_Double	6	
CONSTANT_Class	7	
CONSTANT_String	8
CONSTANT_Fieldref	9	
CONSTANT_Methodref	10	

CONSTANT_InterfaceMethodref	11
CONSTANT_NameAndType	12	
CONSTANT_MethodHandle	15	
CONSTANT_MethodType	16	
CONSTANT_Dynamic	17	
CONSTANT_InvokeDynamic	18	
CONSTANT_Module	19	
CONSTANT_Package	20
```

**4、结构体**
> CONSTANT_Class_info {
    u1 tag;
    u2 name_index
}

> CONSTANT_Fieldref_info {
    u1 tag;
    u2 class_index;
    u2 name_and_type_index;
}

> CONSTANT_Methodref_info {
    u1 tag;
    u2 class_index;
    u2 name_and_type_index;
}

> CONSTANT_InterfaceMethodref_info {
    u1 tag;
    u2 class_index;
    u2 name_and_type_index;
}

> CONSTANT_String_info {
    u1 tag;
    u2 string_index;
}

> CONSTANT_Integer_info {
    u1 tag;
    u4 bytes;
}

> CONSTANT_Long_info {
    u1 tag;
    u4 high_bytes;
    u4 low_bytes;
}

等等等

**5、字段**
一个 class 文件中没有两个字段具有相同的名称和描述，方法也是如此。
> field_info {
    u2             access_flags; //表示访问权限或字段属性，public、static
    u2             name_index;
    u2             descriptor_index;
    u2             attributes_count;
    attribute_info attributes[attributes_count];
}


略略略


# [JVM 指令集](https://docs.oracle.com/javase/specs/jvms/se11/html/jvms-6.html)