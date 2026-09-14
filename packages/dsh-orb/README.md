# dsh-orb

桌面上的一个状态球 —— 把 AI 助手**在不在干活、有没有卡住**放到浏览器窗口外面。

窗口最小化了、被别的窗口盖住了、切到别的虚拟桌面了，球都还在那儿。

> **代码由 AI 生成** —— 数字都是实测的，但请自己读一遍再用。详见[仓库说明](../../README.md)。

```
        ╭───────────╮
        │  ╭─────╮  │   外圈  蓝色旋转弧    → 运行中
        │  │  2  │  │   内圈  绿 / 红弧     → 未读成功 / 失败
        │  ╰─────╯  │   球体颜色           → 要你动手（黄=待决策，红=求救）
        ╰───────────╯   中间数字           → 正在跑的会话数
```

左键单击把宿主窗口拉到前台，左键拖动移动它，右键出菜单。

---

## 为什么单独写了个桌面程序

**因为网页做不到。**

浏览器的画中画（Document PiP）看起来能凑合，但它的限制是死的（[Chrome 官方文档](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)）：

> The Picture-in-Picture window **position cannot be set by the website**.

而且它是浏览器给的原生矩形窗，**带标题栏、不能透明、不能裁成圆形**。做不出球，也给不了"贴在桌面角落不动"的感觉。

真正需要的三条能力——无边框、逐像素透明、永远置顶——都是**窗口级的原生能力**，只有桌面程序拿得到。

### 三种实现都实测过

| 方案 | 私有内存 | 空闲 CPU | 逐像素透明 | 结论 |
|---|---|---|---|---|
| PowerShell + WPF | 88.4 MB | — | ✅ | 被 PowerShell 运行时拖累 |
| Rust + egui (glow) | **121.7 MB** | **96% 单核** | ❌ 失败 | 两项都输 |
| **C# + WPF** | **59.0 MB** | **0%** | ✅ | **选它** |

Rust 那版输在两个地方，而且都不是"代码写得好不好"的问题：

- **内存**：大头是 NVIDIA 的 OpenGL 栈（`nvoglv64.dll` 46 MB + `nvgpucomp64.dll` 94 MB），我们自己的 exe 只有 6 MB。换后端也躲不掉这笔 GPU 税。
- **CPU**：egui 是立即模式，每帧从零重画整个界面 → 一个核跑满。WPF 是保留模式，只重绘变化的部分 → 同样的动画只要 20%，静止时 **0%**。对一个常驻桌面的挂件来说，这条是决定性的。

---

## 装法

**要求**：Windows + [.NET 10 桌面运行时](https://dotnet.microsoft.com/download/dotnet/10.0)（编译需要 SDK，只跑需要运行时）。

### 1. 编译球

```bash
cd desktop/dsh-orb
dotnet build -c Release
```

产物在 `bin/Release/net10.0-windows/DshOrb.exe`（158 KB，纯离线编译，约 1 秒）。

单独双击它也能跑 —— 没有 `--origin/--token` 参数时会进入**演示模式**，右键菜单可以循环切换各种状态，方便单独调外观。

### 2. 安装宿主插件

把 `packages/dsh-orb` 挂进你的宿主 profile：

```bash
dsh plugin --profile <你的profile> add <这个仓库>
```

或者手动：在 profile 的 `package.json` 里把 `dsh-orb` 加进 `dsh.profile.bundles`，并建好链接。

### 3. 重启宿主

bundle 是启动时组合的，所以**要重启才生效**。之后球会自动出现，宿主一停球就跟着走。

---

## 它显示什么

| 视觉 | 含义 | 状态 |
|---|---|---|
| 外圈蓝色旋转弧 + 中间数字 | 正在跑的**会话数**（含后台任务和子代理） | ✅ |
| 内圈绿色弧（12 点右侧顺时针） | 未读的成功数 | ✅ |
| 内圈红色弧（12 点左侧逆时针） | 失败数 | ✅ |
| 球体泛黄、脉动、外向光晕环 | 待决策：模型在等你回答 | ✅ |
| 球体泛红、脉动、向内的 ping | 中途求救：模型判断方向错了 | ⬜ 待做 |

**没有内容的圈根本不画。** 这条是从手表表盘上抄的 —— 也是它没事的时候看起来安静的原因。

### 关于"失败"的判定

只有这三种 `turn/end` 才算失败：

```
error        模型请求失败（限流 / 余额 / 超时 / 上下文超限 / 服务端 5xx）
blocked      被规则否决
max-tokens   输出撞到上限
```

`aborted`（你自己按了停止）和 `interrupted`（宿主崩溃后补记的收尾）**都不算失败**。

### 关于"未读"

只有**你看了**才会清掉，没有定时器。触发点是：在那个会话里发了消息、或者那个会话开始了新一轮。

---

## 数据怎么流

```
宿主进程
  └─ dsh-orb 插件
       ├─ 在宿主自己的 web server 上挂 GET /dsh-orb/status（loopback + token）
       └─ 用 ctx.subprocess 起 DshOrb.exe，把 port 和 token 当参数传过去
              └─ 球每秒拉一次，断了 5 次就清零并标记未连接
```

状态来源都是**公开契约**：

- 运行中：会话事件流折叠（`turn/start` 之后没有 `turn/end`）+ `ctx.jobs` 里 `status === 'running'` 的，按会话去重
- 成功 / 失败：`turn/end` 的 `reason.kind`
- 待决策：包一层 `user-questions/request` 的 waterfall，**只旁观不抢答** —— 调 `next()` 让真正的答题方照常工作

---

## 生命周期

球跟着宿主走，三种终止方式都覆盖：

| 环节 | 机制 |
|---|---|
| 启动 | 插件的 `apply()` 里用 `ctx.subprocess` 起球 |
| 正常退出 | 服务的销毁会终止所有托管进程；插件另挂了显式 disposer |
| **强杀** | 宿主在 Windows 上是用 **kill-on-close 的 Job Object** 起子进程的，内核保证连带终止 |

最后一条是白捡的：宿主自带的 `dsh-win32-process` 用 Koffi（纯 JS FFI）绑了 Win32，`dsh-subprocess-local` 的 runner 就是拿它把子进程放进 Job 的。**球自己什么都不用做。**

---

## 踩过的坑

写这个球的过程中踩到的，记下来省得再踩：

**透明窗口里不要用大面积模糊阴影。** `DropShadowEffect(BlurRadius=26)` 在不透明背景上是投影，在 `AllowsTransparency=True` 的窗口里就是球外一圈糊糊的灰雾 —— 没有"背景"可投。要立体感就把 `BlurRadius` 压到 6 以内，或者干脆只留边框。

**不要手工给 WPF 的菜单刷颜色。** `ContextMenu.Foreground` 传不到 `MenuItem` 上（默认样式在"样式设置器"里显式设了它，会盖掉属性继承）；而给 `MenuItem` 刷 `Background` 又会把模板里的**勾选栏**和**分隔条**弄脏，出来是左边一列白方块。交给系统主题画就对了。

**关掉宿主再编译。** 正在运行的 exe 会锁住输出文件，`dotnet build` 会重试 10 次然后失败。

---

## 许可

MIT
