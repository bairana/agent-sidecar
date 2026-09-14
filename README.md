# agent-sidecar

给 AI 编码助手配的**桌面配件**。

浏览器里的 AI 助手有个共同的毛病：**你不看着它，就不知道它在干什么。**
窗口一缩、一切走，它是跑得飞快还是早就卡死了，你完全没数。等你想起来回来看一眼，可能已经烧了十分钟的 token 在一个错的方向上。

这个仓库里的东西都在解决这件事 —— **把助手的状态从浏览器窗口里拿出来，放到你随时瞟得到的地方。**

---

> ## ⚠️ 这些代码是 AI 生成的
>
> 仓库里的代码由 **AI 助手**（DeepSeek Harness 里的 agent）编写。人负责提需求、验收、拍板和把关。
>
> **具体意味着什么，说清楚：**
>
> - **关键结论都实测过。** README 里那些内存、CPU、体积都是量出来的数字，不是估的 —— Rust 那版方案被推翻，正是因为实测打脸了估算。
> - **但不保证没有遗漏。** AI 常见的毛病这里都有：过度自信的注释、看着合理但没验证的假设、啰嗦的防御代码。
> - **插件那半会跑在你的宿主进程里。** 用之前请自己读一遍，尤其是 `apply()` 的边界处理。
> - **`dsh-orb` 的桌面程序会常驻在你桌面。** 它要的权限（置顶窗口）和它读的东西（一个 loopback 状态接口）都写在 README 里了。
>
> 发现问题欢迎提 issue —— 但请把它当成一份**需要你自己复核的代码**，而不是可以直接信的成品。

---

## 目录

| | 是什么 | 形态 |
|---|---|---|
| [`dsh-orb`](packages/dsh-orb) | **桌面状态球** —— 窗口最小化也能看到在不在干活、有没有卡住 | C# WPF 程序 + 宿主插件 |
| [`dsh-balance-files`](packages/dsh-balance-files) | **浮动面板** —— 账户余额 + 工作区文件，可折叠、跟随主题 | 宿主 + 前端插件 |
| [`desktop/preview`](desktop/preview/orb.html) | 状态球的设计预览，浏览器里直接看动效 | 单文件 HTML |
| [`tools`](tools) | 跟本机环境配套的几个小脚本 | Node |

---

## dsh-orb

```
        ╭───────────╮
        │  ╭─────╮  │   外圈  蓝色旋转弧   → 运行中
        │  │  2  │  │   内圈  绿 / 红弧    → 未读成功 / 失败
        │  ╰─────╯  │   球体颜色          → 要你动手（黄=待决策）
        ╰───────────╯   中间数字          → 正在跑的会话数
```

左键单击把宿主窗口拉到前台，左键拖动移动它，右键出菜单（还能改大小）。

**没有内容的圈根本不画** —— 这条是从手表表盘上抄的，也是它没事的时候看起来安静的原因。

### 为什么单独写了个桌面程序

**因为网页做不到。**

浏览器的画中画（Document PiP）看着能凑合，但限制是死的（[Chrome 官方文档](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)）：

> The Picture-in-Picture window **position cannot be set by the website**.

而且它是浏览器给的原生矩形窗，**带标题栏、不能透明、不能裁成圆形**。做不出球，也给不了"贴在桌面角落不动"的感觉。

真正需要的三条 —— 无边框、逐像素透明、永远置顶 —— 都是**窗口级的原生能力**，只有桌面程序拿得到。

### 三种实现都实测过

| 方案 | 私有内存 | 空闲 CPU | 逐像素透明 | 结论 |
|---|---|---|---|---|
| PowerShell + WPF | 88.4 MB | — | ✅ | 被 PowerShell 运行时拖累 |
| Rust + egui (glow) | **121.7 MB** | **96% 单核** | ❌ 失败 | 两项都输 |
| **C# + WPF** | **59.0 MB** | **0%** | ✅ | **选它** |

Rust 那版输的两项都不是"代码写得好不好"：

- **内存**大头是 NVIDIA 的 OpenGL 栈（`nvoglv64.dll` 46 MB + `nvgpucomp64.dll` 94 MB），我们自己的 exe 只有 6 MB —— 换后端也躲不掉这笔 GPU 税。
- **CPU**：egui 是立即模式，每帧从零重画整个界面 → 一个核跑满。WPF 是保留模式，只重绘变化的部分 → 同样动画只要 20%，静止时 **0%**。对一个常驻桌面的挂件，这条是决定性的。

详细实现、数据来源、踩过的坑见 **[packages/dsh-orb/README.md](packages/dsh-orb/README.md)**。

---

## dsh-balance-files

宿主界面右上角的一块浮动面板：

- **账户余额** —— 走官方 API，实时拉取
- **工作区文件** —— 直接从面板里翻，不用切到文件树
- **可折叠** —— 收起来是一个小胶囊，拖动可移动位置
- **跟随主题** —— 亮色 / 暗色自动适配

拖拽用的是 4px 判定：不动的算点击，动了的才算拖动。

---

## 装法

这些是给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 写的插件，装法是宿主的标准流程。

**要求**：Windows（`dsh-orb` 的桌面程序部分；`dsh-balance-files` 没有平台限制）+ .NET 10 运行时。

### 1. 编译状态球

```bash
cd desktop/dsh-orb
dotnet build -c Release
```

产物 `bin/Release/net10.0-windows/DshOrb.exe`（158 KB，纯离线编译，约 1 秒）。

**单独双击它也能跑** —— 没有 `--origin/--token` 参数时进入演示模式，右键菜单可以循环切换各种状态，方便单独调外观。

### 2. 把插件挂进 profile

在你的宿主 profile 的 `package.json` 里：

```jsonc
{
  "dependencies": {
    "dsh-orb": "link:<这个仓库>/packages/dsh-orb",
    "dsh-balance-files": "link:<这个仓库>/packages/dsh-balance-files"
  },
  "dsh": {
    "profile": {
      "bundles": [ "...", "dsh-orb", "dsh-balance-files" ]
    }
  }
}
```

### 3. 重启宿主

bundle 是启动时组合的，**要重启才生效**。之后球会自动出现，宿主一停球就跟着走。

---

## 目录结构

```
packages/
  dsh-orb/              宿主插件：状态接口 + 起球 + 收球
  dsh-balance-files/    余额与文件的浮动面板
desktop/
  dsh-orb/              状态球本体（C# / WPF）
  preview/orb.html      设计预览页，浏览器打开就能看动效
tools/                  跟本机环境配套的脚本
docs/                   本机笔记（未纳入版本库）
```

---

## 一点工程笔记

写这些东西踩到的坑都记在各自的 README 里了，这里只挑最容易再踩的几条：

**`ctx.get(name)` 拿不到服务，必须用硬 `inject`。** 这条最坑，因为失败得极其安静 —— 服务明明存在、隔壁插件用得好好的，`get()` 就是返回 `undefined`。代价是 `inject` 写错会连累宿主起不来，所以名字都得先核实过。

**插件的失败路径只记日志，所以要自己造可观测点。** 为了让宿主永远能启动，插件里的错误都只能 `warn` —— 而 warn 只进终端。上面那条 bug 就是这么瞎猜了一轮。后来让它每一步都落一行盘，三种情况一眼可分：完全没有日志（模块没加载）／只有一行（`apply()` 没被调用）／有多行（卡在哪一步一目了然）。

**不要 `import` 宿主的包。** 插件在仓库里、宿主包在 profile 的 node_modules 里，两者不在同一棵目录树上 —— ESM 解析不到，而 ESM 不认 `NODE_PATH`。硬 import 的后果是模块加载失败 = 宿主启动失败。需要 `defineTool` 这类辅助函数时，照着它的实现手写等价物（它主要就是 schema DSL → JSON Schema 的转换）。

**不要手工给 WPF 的菜单刷颜色。** `ContextMenu.Foreground` 传不到 `MenuItem` 上（默认样式在"样式设置器"里显式设了它，会盖掉属性继承）；而给 `MenuItem` 刷 `Background` 又会把模板里的**勾选栏**和**分隔条**弄脏，出来是左边一列白方块。交给系统主题画就对了。

**透明窗口里不要用大面积模糊阴影。** `DropShadowEffect(BlurRadius=26)` 在不透明背景上是投影，在 `AllowsTransparency=True` 的窗口里就是球外一圈糊糊的灰雾 —— 没有"背景"可投。

---

## 许可

MIT
