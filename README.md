# ZenTerm

ZenTerm 是一个基于 Wails v2 的桌面 SSH 终端与 SFTP 客户端，后端使用 Go，前端使用 React、TypeScript 和 Vite。项目重点是安全地保存 SSH 凭据、管理常用主机、运行多标签终端、浏览 SFTP 文件，并支持通过 WebDAV 同步本地加密配置。

## 功能特性

- **SSH 终端**：基于 xterm.js，支持多会话、多标签、终端尺寸同步和会话关闭状态追踪。
- **SFTP 文件浏览器**：支持本地与远端目录浏览、上传、下载、目录创建、重命名和删除。
- **加密 Vault**：主密码通过 Argon2id 派生密钥，敏感数据使用 AES-GCM 加密保存。
- **系统钥匙串**：可保存 Vault 主密码和 WebDAV 密码，用于自动解锁和同步认证。
- **主机管理**：支持收藏、分组、标签、已知主机密钥、系统类型检测和最近连接记录。
- **凭据中心**：支持生成、导入、管理 SSH 密钥，查看凭据使用情况。
- **本机 SSH 导入**：可扫描 `~/.ssh` 密钥，并读取 `~/.ssh/config` 中的主机配置。
- **凭据部署**：可将凭据公钥上传到远端主机的 `authorized_keys`，并绑定到主机配置。
- **会话日志**：记录 SSH 连接历史和加密终端输出，终端输出按块写入 `session-transcripts/`。
- **WebDAV 同步**：可将加密快照推送到 WebDAV，或从 WebDAV 拉取恢复，带 ETag 冲突保护。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Go 1.24, Wails v2, pkg/sftp, go-keyring, golang.org/x/crypto |
| 前端 | React 19, TypeScript 6, Vite 7, xterm.js, lucide-react |
| 加密 | Argon2id, AES-256-GCM |
| 测试 | Go test, Vitest, React Testing Library |

## 项目结构

```text
ZenTerm/
├── main.go                    # Wails 应用入口
├── app.go                     # App 构造、默认存储路径
├── app_hosts_sessions.go      # 主机、SSH 会话、会话日志 API
├── app_credentials.go         # 凭据中心、本机 SSH 导入、凭据部署 API
├── app_files.go               # 本地和远端文件操作 API
├── app_sync.go                # WebDAV 同步 API
├── app_vault.go               # Vault 和钥匙串 API
├── app_window.go              # 生命周期、窗口状态、事件发射
├── app_models.go              # 前端 DTO 和模型转换
├── app_errors.go              # 错误规范化
├── vault_preferences.go       # 系统钥匙串中的 Vault 密码保存
├── internal/
│   ├── db/                    # JSON 存储、Vault 加密、会话记录分块文件
│   ├── model/                 # 跨层共享领域模型
│   ├── security/              # Vault、Argon2id、AES-GCM
│   ├── service/               # SSH、SFTP、主机、凭据、同步快照业务逻辑
│   └── syncer/                # WebDAV 同步状态和 provider
├── frontend/
│   ├── src/App.tsx            # 前端主应用
│   ├── src/components/        # 工作区、终端、主机、Vault、SFTP、日志组件
│   ├── src/hooks/             # Vault、Host、Workspace、Session 相关 hooks
│   ├── src/lib/               # Wails 绑定封装和工具函数
│   ├── src/styles/            # 应用样式
│   └── src/__tests__/         # 前端测试
└── wails.json                 # Wails 配置
```

## 开发命令

### 后端

```bash
make test-go
wails dev
wails build
```

### 前端

```bash
cd frontend
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

## GitHub 云端发布

项目已配置 GitHub Actions Release workflow，版本暂定为 `0.1.0`。推送 `v0.1.0` 这样的 tag 后，GitHub 会在云端完成验证、三平台构建，并把产物发布到 GitHub Release。

### 发布步骤

```bash
git push origin main
git tag v0.1.0
git push origin v0.1.0
```

也可以在 GitHub 的 Actions 页面手动运行 `Release` workflow，并填写版本号 `0.1.0`。

### 云端构建产物

- `ZenTerm-0.1.0-macos-universal.zip`：macOS Universal，兼容 Intel 与 Apple Silicon。
- `ZenTerm-0.1.0-macos-amd64.zip`：macOS Intel。
- `ZenTerm-0.1.0-macos-arm64.zip`：macOS Apple Silicon。
- `ZenTerm-0.1.0-windows-amd64.zip`：Windows x64。
- `ZenTerm-0.1.0-linux-amd64.tar.gz`：Linux x64，需要系统安装 GTK3 与 WebKitGTK 运行库。
- 每个包旁边都会生成 `.sha256` 校验文件。

macOS Universal 是主包，macOS Intel / Apple Silicon 单独包是附加构建；附加构建失败不会阻塞 Release 发布。当前发布包未做代码签名和 macOS notarization，首次运行时系统可能提示安全确认。后续如果接入 Apple Developer 证书和 Windows 签名证书，可以在 Release workflow 中增加签名步骤。

## 数据与安全模型

默认数据目录来自 `os.UserConfigDir()`，主数据文件为 `ZenTerm/config.zen`。窗口状态保存在同目录的 `window-state.json`，会话记录块保存在 `session-transcripts/`。

Vault 初始化后会保存随机盐和加密校验载荷。解锁时使用主密码和盐派生 AES-256 密钥，主机密码、私钥、凭据密钥、会话记录和同步快照中的敏感数据都以加密形式落盘。系统钥匙串只用于可选保存 Vault 主密码和 WebDAV 密码。

## 同步说明

WebDAV 同步会构建本地加密快照并上传到远端路径。推送和拉取都会记录远端 ETag 与本地快照 hash，用于检测冲突。拉取远端快照时需要输入主密码，以便解密并导入远端数据。

## 当前注意事项

- `frontend/src/wailsjs/` 是 Wails 生成目录，不要手动编辑。
- `frontend/dist/`、`build/`、`.snow/` 和本地构建产物 `zenterm` 不应提交。
- 项目仍在前端 TypeScript 迁移和状态拆分过程中，新代码优先使用 `.ts` / `.tsx`。
- 修改凭据、Vault、同步或会话日志时，要避免在错误信息和日志中暴露明文密码、私钥或解密后的记录内容。
