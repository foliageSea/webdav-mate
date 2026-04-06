# WebDAV Mate

WebDAV Mate 是一个基于 Electron + Vue 3 + TypeScript 的桌面端 WebDAV 文件管理工具，支持多连接管理、文件浏览与传输队列。

## 功能特性

- 多 WebDAV 连接管理（新增、编辑、删除、连接测试、快速切换）
- 远程目录浏览与基础文件操作（列表、进入目录、删除、移动）
- 本地与远程之间的上传/下载任务队列
- 任务控制能力（暂停、继续、取消、失败重试、清理已完成）
- 图片/视频预览能力（本地预览路径、DataURL、在线预览链接）
- 桌面端窗口控制（最小化、最大化/还原、关闭）

## 技术栈

- Electron 39
- Vue 3 + Vue Router
- TypeScript
- Naive UI + UnoCSS
- electron-builder（Windows/macOS/Linux 打包）

## 环境要求

- Node.js 20+
- pnpm 9+（推荐）

## 快速开始

### 1) 安装依赖

```bash
pnpm install
```

### 2) 启动开发环境

```bash
pnpm dev
```

### 3) 代码检查与格式化

```bash
pnpm lint
pnpm format
pnpm typecheck
```

## 打包构建

```bash
# 仅构建产物（不打安装包）
pnpm build

# 生成 unpacked 目录
pnpm build:unpack

# 生成平台安装包
pnpm build:win
pnpm build:mac
pnpm build:linux
```

构建输出目录：`dist/`

## 项目结构

```text
.
├─ src/
│  ├─ main/        # Electron 主进程（IPC、WebDAV、传输队列、预览）
│  ├─ preload/     # 预加载脚本与安全桥接 API
│  └─ renderer/    # Vue 渲染进程（页面、布局、路由）
├─ shared/         # 主进程与渲染进程共享类型
├─ build/          # 打包图标与平台配置资源
└─ electron-builder.yml
```

## 常用脚本

- `pnpm dev`：开发模式运行应用
- `pnpm start`：预览模式启动应用
- `pnpm build`：构建 Electron + Renderer
- `pnpm lint`：执行 ESLint
- `pnpm format`：执行 Prettier 格式化
- `pnpm typecheck`：执行 TypeScript 与 Vue 类型检查

## 推荐开发工具

- [VS Code](https://code.visualstudio.com/)
- [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## 许可证

当前仓库未声明许可证，请在发布前补充 `LICENSE` 文件。
