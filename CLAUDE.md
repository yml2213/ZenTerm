# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 项目概述

ZenTerm 是一个基于 Wails v2 构建的桌面 SSH 终端和 SFTP 客户端（Go 后端 + React 前端）。应用提供通过系统钥匙串的安全凭据管理、带加密记录的会话日志，以及集成的 SFTP 文件浏览器。

## 开发命令

### 后端 (Go)
```bash
# 运行所有测试
go test ./...

# 运行特定包的测试
go test ./internal/service
go test ./internal/db

# 构建应用
wails build

# 开发模式（热重载）
wails dev
```

### 前端 (React + Vite)
```bash
cd frontend

# 安装依赖
npm install

# 运行测试
npm test

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 仅构建前端
npm run build

# 开发服务器（由 wails dev 使用）
npm run dev
```

## 架构设计

### 后端结构

Go 后端采用分层架构：

- **`main.go` + `app*.go`**: Wails 应用层，通过绑定向前端暴露后端方法。`App` 结构体充当前端和服务层之间的桥梁。
- **`internal/service/`**: 业务逻辑层，管理 SSH 会话、SFTP 连接、vault 生命周期和主机密钥验证。`Service` 结构体协调所有操作。
- **`internal/db/`**: 数据持久化层，使用加密的 JSON 存储（`config.zen`）。处理主机、凭据、会话日志和记录。
- **`internal/security/`**: 使用 vault 模式进行加密/解密。所有敏感数据（密码、私钥、记录）在静态存储时都被加密。
- **`internal/model/`**: 跨层共享的领域模型。

### 前端结构

React 前端正在从 JavaScript 迁移到 TypeScript：

- **`App.tsx`**: 主应用组件，协调工作区路由和全局状态。
- **`hooks/`**: 按领域拆分的自定义 hooks：
  - `useAppState.ts`: 中央状态管理（正在重构为领域特定的 hooks）
  - `useVaultState.ts` / `useVaultActionHandlers.ts`: Vault 解锁/锁定状态
  - `useHostState.ts` / `useHostActionHandlers.ts`: 主机管理
  - `useWorkspaceState.ts` / `useWorkspaceActionHandlers.ts`: 工作区/标签页导航
  - `useSessionActionHandlers.ts`: SSH 会话生命周期
  - `useAppEffects.ts`: 生命周期效果（启动、快捷键、窗口状态）
- **`components/`**: UI 组件，包括：
  - `SshWorkspace.jsx`: 使用 xterm.js 的 SSH 终端工作区
  - `SftpWorkspace.jsx`: SFTP 文件浏览器（1255 行，最大的组件）
  - `LogWorkspace.jsx`: 会话日志查看器
  - `VaultWorkspace.tsx`: Vault 解锁/设置 UI
  - `HostList.tsx`: 主机管理面板
- **`contexts/`**: 主题和语言的 React contexts
- **`lib/`**: 工具函数和配置
- **`wailsjs/`**: 自动生成的 Wails 绑定（不要手动编辑）

### 数据流

1. 前端通过 Wails 绑定调用 Go 方法（`wailsjs/go/main/App.js`）
2. `App` 结构体方法规范化错误并委托给 `Service`
3. `Service` 协调业务逻辑，管理内存状态（会话、SFTP 连接），并通过 `Store` 持久化
4. `Store` 在写入 `config.zen` 之前使用已解锁的 `Vault` 加密敏感数据
5. 后端通过 `runtime.EventsEmit` 向前端发送事件以进行异步更新（终端输出、文件传输）

### 加密模型

- 用户在启动时使用主密码解锁 vault
- Vault 从密码 + 盐（存储在 `config.zen` 中）派生加密密钥
- 所有凭据、私钥和会话记录都使用 AES-GCM 加密
- Vault 在应用生命周期内保持解锁状态；重新锁定需要重启应用

## 关键实现细节

### 会话记录存储

会话记录使用**分块存储模型**（在 `internal/db/store.go` 中实现）：
- 记录被拆分为块，存储在 `session-transcripts/` 下的独立 `.jsonl` 文件中
- 每个块单独加密
- 服务层缓冲终端输出，每 200ms 或缓冲区超过 32KB 时刷新
- 这可以防止长时间运行的 SSH 会话出现性能下降

**重要**: 旧的单文件记录存储（`sessionTranscriptEntry` 中的 `Content` 字段）已弃用，但为了向后兼容仍然存在。新代码应使用分块模型（`Chunks` 字段）。

### 前端状态管理

前端正在进行重构，将单体的 `useAppState` hook 拆分为领域特定的 hooks：
- `useVaultState` - vault 锁定/解锁状态
- `useHostState` - 主机列表和选择
- `useWorkspaceState` - 工作区/标签页导航
- Session 状态 - 在 `SshWorkspace` 组件中管理

修改状态时，优先使用领域特定的 hooks，而不是向 `useAppState` 添加内容。

### 终端集成

终端渲染使用 xterm.js 和 FitAddon：
- `TerminalPane.jsx` 管理终端生命周期和类似 WebSocket 的事件流
- 终端输出缓冲在 `buffersRef` 中以支持标签页切换
- **已知问题**: 代码访问 `terminal._core`（私有 API）进行几何计算。这很脆弱，如果修改应封装到工具函数中。

### SFTP 实现

SFTP 连接与 SSH 会话分开管理：
- 每个 SFTP 工作区创建一个带 SFTP 子系统的专用 SSH 连接
- 连接池化在 `Service.sftpConnections` map 中
- 文件传输向前端发送进度事件
- `SftpWorkspace.jsx` 是最大的组件（1255 行），如果扩展应拆分为更小的组件

## 测试

### 后端测试
- 使用 `t.Run()` 的表驱动测试处理多个场景
- 使用接口模拟外部依赖（SSH dialer、凭据存储）
- 测试文件遵循 `*_test.go` 命名约定
- 示例：`app_test.go`、`internal/service/service_test.go`

### 前端测试
- 使用 Vitest + React Testing Library
- 测试文件遵循 `*.test.jsx` 命名约定
- 在 `frontend/src/test/setup.js` 中模拟 Wails 绑定
- 示例：`App.workspace.test.jsx`、`App.sftp.test.jsx`

## 常见模式

### 添加新的后端方法

1. 在适当的 `app_*.go` 文件中向 `App` 结构体添加方法
2. 使用 `normalizeFrontendError()` 包装错误以供前端使用
3. 将业务逻辑委托给 `Service` 层
4. 前端将在下次 `wails dev` 或 `wails build` 时自动生成绑定

### 添加新的前端功能

1. 在 `components/` 中创建组件
2. 在适当的 hook 中添加状态管理（或创建新的领域 hook）
3. 从 `wailsjs/go/main/App.js` 导入 Wails 绑定
4. 使用用户友好的消息处理错误
5. 在 `styles/` 目录中添加样式

### 处理加密数据

1. 在访问加密数据之前确保 vault 已解锁
2. 使用自动处理加密/解密的 `Service` 方法
3. 永远不要在错误消息中记录或暴露解密的凭据
4. 所有加密都在 `internal/security/vault.go` 中进行

## 已知技术债务

来自 `docs/优化.md`：

1. **会话记录性能**: 分块存储已实现，但对于非常长的会话可以进一步优化
2. **前端状态复杂性**: `useAppState` 正在重构为领域特定的 hooks
3. **SFTP 组件大小**: `SftpWorkspace.jsx`（1255 行）应拆分为更小的组件
4. **终端缓冲区增长**: 前端在内存中缓冲所有终端输出；应实现大小限制
5. **CSS 组织**: 样式缺乏统一的设计 token 系统（颜色、间距和高度）

## 文件位置

- 主数据文件: `~/Library/Application Support/ZenTerm/config.zen` (macOS)
- 会话记录: `~/Library/Application Support/ZenTerm/session-transcripts/`
- 窗口状态: `~/Library/Application Support/ZenTerm/window-state.json`
- Wails 配置: `wails.json`
- 前端配置: `frontend/package.json`、`frontend/tsconfig.json`

## 迁移说明

前端正在从 JavaScript 迁移到 TypeScript：
- 新文件应使用 `.ts` 或 `.tsx` 扩展名
- Hooks 已迁移；组件正在进行中
- 在迁移期间可能同时存在 `.js` 和 `.ts` 版本
- 新代码优先使用 TypeScript
