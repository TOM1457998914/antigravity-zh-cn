# Antigravity 简体中文补丁

**[前往最新版发布页下载 Windows 补丁](https://github.com/TOM1457998914/antigravity-zh-cn/releases/latest)**

适用于 Windows 版 **Google Antigravity App 2.33.0、2.34.0、2.35.0、2.35.1、2.35.2 和 2.36.0**。补丁覆盖菜单、设置、首次使用引导和对话控件。2.35 系列补齐了对话时间、模型档位、新建自动化表单、扩展市场及组合读写权限提示。第三方插件动态提供的部分内容可能仍显示英文。

本仓库提供补丁源码和词库。工具按 SHA-256 识别安装版本，并使用本机的官方 `app.asar` 生成汉化文件。补丁只处理界面文案，AI 回复语言由对话和模型设置决定。

## 实机截图

![Windows 版 Antigravity 2.34.0 汉化实机截图，展示侧边栏与扩展市场](screenshot-zh-cn.jpg)

## 安装和更新后重新应用

1. 确认已安装上面列出的 Windows 版 Antigravity 和 Node.js 20 或更新版本。 [Node.js 官方下载](https://nodejs.org/en/download)
2. 从发布页的下载区获取 `antigravity-zh-cn-v1.2.0-windows.zip` 和 `SHA256SUMS.txt`。核对校验值后解压，把补丁目录保存在 Antigravity 安装目录之外。 [最新版发布页](https://github.com/TOM1457998914/antigravity-zh-cn/releases/latest)
3. 保存工作，从 Windows 系统托盘彻底退出 Antigravity。双击补丁目录内的 `apply-zh-cn.cmd`，看到「已安装简体中文界面」后重新打开 Antigravity。

在 ZIP 所在目录打开 PowerShell，运行下面的命令，并将输出的 `Hash` 与 `SHA256SUMS.txt` 中同名文件的 SHA-256 值比较。

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\antigravity-zh-cn-v1.2.0-windows.zip'
```

Antigravity 更新或重装时会重新写入应用归档。若更新后界面恢复英文，退出 Antigravity，再双击同一个 `apply-zh-cn.cmd`。脚本会根据当前归档的 SHA-256 选择对应补丁。遇到「当前归档不受支持」时，可用下方的 `status` 命令查看归档 SHA-256 及可读取的自报版本，再到最新版发布页确认是否已支持此版本。 [最新版发布页](https://github.com/TOM1457998914/antigravity-zh-cn/releases/latest)

### 命令行和自定义安装目录

在补丁目录打开 PowerShell。默认安装目录为 `%LOCALAPPDATA%\Programs\antigravity`。

```powershell
node .\localize.mjs status
node .\localize.mjs apply
```

如果装在其他位置，用 `--app-dir` 指定含有 `resources` 子目录的应用安装目录。

```powershell
node .\localize.mjs status --app-dir 'D:\Apps\Antigravity'
.\apply-zh-cn.cmd --app-dir 'D:\Apps\Antigravity'
```

### 使用便携版 Node.js

如果系统路径里没有符合版本要求的 Node.js，可从官网下载 Windows 便携版，把 `node.exe` 放到 `%LOCALAPPDATA%\Antigravity-Localization\node\node.exe`。双击脚本会自动查找该位置。 [Node.js 官方下载](https://nodejs.org/en/download)

在 PowerShell 中，可以用以下方式运行 `status`、`apply`、`restore` 和 `build`。

```powershell
& "$env:LOCALAPPDATA\Antigravity-Localization\node\node.exe" .\localize.mjs status
```

## 恢复英文界面

通过系统托盘彻底退出 Antigravity，再运行以下命令。若安装时指定了 `--app-dir`，恢复时也指定同一目录。

```powershell
node .\localize.mjs restore
```

工具将原版按版本备份到 `%LOCALAPPDATA%\Antigravity-Localization\backups\<版本>\app.asar.original`。备份位于默认软件安装目录之外，软件更新或重装后仍可使用。工具兼容旧版在 `resources` 目录内生成的备份，重新应用汉化时会把通过校验的备份复制到上述位置。如果该位置已有不同内容，工具会保留现有文件，并尝试用原版 SHA-256 作为新备份的文件名后缀。

工具以 SHA-256 验证原版、备份和生成的汉化归档。`status` 会显示当前归档的 SHA-256 以及通过验证的原版备份。`restore` 只使用当前版本对应的已验证备份。

## 单独生成汉化文件

`build` 默认读取受支持版本的本机原始归档或已校验的原版备份，并在当前目录生成 `app.asar.zh-cn`。也可以用 `--input` 指定原版归档，用 `--output` 指定一个单独的输出路径。

```powershell
node .\localize.mjs build
node .\localize.mjs build --input 'D:\Backups\app.asar' --output '.\app.asar.zh-cn'
```

## 2.36.0 Windows 兼容性验证

2.36.0 原始应用归档中，现有补丁涉及的 28 个文件均与 2.35.2 逐字节一致。实机确认重新应用补丁后可启动，并核对了首页、侧栏、消息输入及其辅助功能标签、模型档位、通用设置和应用版本。下方的逐项覆盖统计来自 2.35.2。

## 2.35.2 Windows 实机覆盖

以下为 2026 年 11 月 26 日在 Windows 版 2.35.2 上核对的 Antigravity 界面抽样。每组对重复显示的同一文案去重，检查菜单、按钮、标题、说明、占位提示和可读出的辅助功能名称。专有名称、用户内容、模型回复和第三方插件提供的动态文案另有来源，统计只计入应用自身的可翻译文案。

| 实测页面和状态 | 已汉化 / 样本数 |
| --- | ---: |
| 首页、侧栏及新建对话输入区 | 43 / 43 |
| 模型选择菜单 | 11 / 11 |
| 通用设置 | 51 / 51 |
| 工具权限和文件访问规则 | 18 / 18 |
| 自动化列表、新建表单和频率菜单 | 25 / 25 |
| 扩展市场、分类和精选详情入口 | 24 / 24 |
| 已安装扩展列表 | 11 / 11 |
| 内置 Swarm 插件详情 | 8 / 8 |
| 版本和更新菜单 | 2 / 2 |
| **合计** | **193 / 193（100%）** |

首次引导、托盘、SSH/WSL 实际连接与失败提示、自动化编辑和真正的下载或安装更新状态未计入实机覆盖。构建检查另外验证了首次引导、通行密钥和远程连接页面等五处原生页面的中文语言标记。第三方插件的部分说明仍可能显示英文。

## 运行测试

使用 Node.js 20 或更新版本，在仓库目录运行以下命令。

```powershell
npm test
```

也可以直接运行 `node --test`。测试使用临时目录和合成归档，涵盖版本识别、拒绝未知 SHA-256、同版本重装、跨版本升级、旧备份迁移和恢复。双击脚本、安装与恢复用例在 Windows 上运行。

## 来源和许可

这是社区维护的界面补丁，在 `antigravity-cn-community/Antigravity-Chinese-Localization` 的 v2.33.0、v2.34.0 和 v2.35.0 基础上整理，并保留 aabbWei 和 antigravity-cn-community contributors 的版权声明。2.35.1 和 2.35.2 适配分别以对应版本的官方归档为输入。补丁源码采用 MIT 许可证。 [上游 v2.33.0](https://github.com/antigravity-cn-community/Antigravity-Chinese-Localization/releases/tag/v2.33.0) · [上游 v2.34.0](https://github.com/antigravity-cn-community/Antigravity-Chinese-Localization/releases/tag/v2.34.0) · [上游 v2.35.0](https://github.com/antigravity-cn-community/Antigravity-Chinese-Localization/releases/tag/v2.35.0) · [MIT 许可证](LICENSE)

