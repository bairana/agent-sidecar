# dsh-balance-files

宿主界面右上角的**浮动面板** —— 账户余额和工作区文件放在一起，不用来回切。

> **代码由 AI 生成** —— 请自己读一遍再用。详见[仓库说明](../../README.md)。

```
  ╭──────────────────────────╮
  │ DeepSeek 余额 · 文件   ─ ×│   ← 这一条可以拖动
  ├──────────────────────────┤
  │ 总余额           ¥ 12.34 │
  │ ──────────────────────── │
  │ 文件                      │
  │   notes.md                │
  │   config.json             │
  ╰──────────────────────────╯
```

收起来是一个小胶囊，点一下展开。

## 特性

- **账户余额** —— 走官方 API 实时拉取
- **工作区文件** —— 列表、查看内容、删除（删除有二次确认）
- **可折叠** —— 收起成胶囊，胶囊本身也能拖动
- **拖动 / 点击分得清** —— 4px 判定：不动的算点击，动了的才算拖动，所以胶囊既能拖动又能点击展开
- **跟随主题** —— 亮色 / 暗色自动适配
- **位置记忆** —— 拖过之后下次打开还在那儿

## 结构

它是**两个半边**：

| | 文件 | 干什么 |
|---|---|---|
| 宿主半 | `lib/index.js`（207 行） | 在宿主自己的 web server 上挂一组 `/api/ds/*` 路由，代理 DeepSeek 的余额和文件接口 |
| 前端半 | `lib/client.js`（686 行） | React 渲染的浮动面板，挂在 `shell.overlay` 插槽里 |

```
浏览器页面                       宿主进程                     DeepSeek
  dsh-balance-files ──fetch──▶ /api/ds/balance ──▶ ──────▶ /user/balance
    (lib/client.js)             /api/ds/files   ──▶ ──────▶ Files API
                                (lib/index.js)
```

**密钥不经手前端。** 宿主半从 `credentials` 服务拿凭据、在服务端发请求，页面里只拿到整理好的 JSON。

路由只接受 loopback 请求，且校验 `Origin` 与 `Host` 同源。

## 安装

在宿主 profile 的 `package.json` 里：

```jsonc
{
  "dependencies": {
    "dsh-balance-files": "link:<这个仓库>/packages/dsh-balance-files"
  },
  "dsh": {
    "profile": {
      "bundles": [ "...", "dsh-balance-files" ]
    }
  }
}
```

后端服务需要凭据才能拉余额 —— 由宿主的 `credentials` 服务提供。

## 一个移植性备注

它用的是**硬 inject**：

```js
export const inject = ['credentials', 'webServer']
```

这两个服务在 web profile 里一定存在，所以没问题。但如果哪天要把它挂到别的组合里，**先确认这两个服务在** —— 硬依赖不满足时插件会一直处于等待状态，而不是安静地跳过。

> 同仓库的 `dsh-orb` 一开始想"更稳一点"，改用了 `ctx.get()` + 判空。
> **结果插件彻底不工作**：在这个宿主里 `ctx.get('webServer')` 返回 `undefined` —— 服务明明在，
> 别的插件用得好好的。后来也改回了硬 inject。
> 所以这里的硬 inject 不是将就，是**唯一可行的写法**，见 `dsh-orb` 的 README。

## 许可

MIT
