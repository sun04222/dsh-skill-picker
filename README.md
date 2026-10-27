# dsh-skill-picker · 输入框里的 skill 选择器

DeepSeek Harness (DSH) Web 插件：在输入框工具行加一个「Skill」按钮，点开即可浏览/搜索当前会话可用的 skill，选中后把 `/skill-name ` 插入草稿光标处——走官方 `/name` 识别链路（发送后自动加载对应 skill），不需要手打命令。

- 列表与 `/` 菜单同源（`skills/list` Remote），只列当前会话**可见**的 skill，不会出现你调不动的
- 选中只把 `/name ` 放进草稿、**不发送任何消息**，是否发送由你决定；插入可一键撤销
- 无第三方依赖，不 require 其它 Harness Client 包，控件自绘、只用 `--dsw-alias-*` 主题令牌

## 快速开始

安装后重启 DSH Web → 刷新页面 → 输入框左侧出现「Skill」按钮 → 点开选一项 → 回车，`/name ` 已落在光标处。

## 功能

- 输入框左侧工具行新增一枚「Skill」按钮（`conversation.input.left` 槽位）。
- 点击弹出可搜索的 skill 列表：数据来自 `skills/list` Remote（与 `/` 菜单同源，仅列当前会话可见的 user-invocable skill）。
- 列表每行显示 skill 名称与简介；支持按名称/简介过滤；`↑`/`↓` 移动高亮，`Enter` 选中，`Esc` 关闭。
- 选中后通过 `inputActions.captureInsertion()` + `insertText()` 在光标处插入可撤销的 `/name ` 文本，由官方输入管线渲染为 skill chip。
- 目录按会话缓存（single-flight），插件管理器变更后自动失效。

## 安装

把本目录作为本地插件目录安装（与 dsh-prompt-enhance 同方式），重启 DSH Web 后生效。

## 结构

- `index.js` — Host 侧空 apply（纯 UI 插件，仅用于出现在 Loader）。
- `client.js` — Web 客户端：按钮 + 弹层。
- `cordis.patch.yml` — 往组合里插入一行本插件。
- `package.json` — `dsh.client` 声明（platform web / immediately / inject 排序）。

## 说明

- 遵循 DSH 纯 JS 插件规则：不 require 其它 Harness Client 包，控件自绘，只用 `--dsw-alias-*` 主题令牌。
- 不自动启用任何 skill、不发送任何消息——只负责把 `/name` 文本放进草稿，是否发送由用户决定。
