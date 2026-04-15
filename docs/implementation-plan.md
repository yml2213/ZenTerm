# ZenTerm MVP 计划重构（基于当前代码现状）

## 摘要

当前仓库已经具备可用的后端基础能力，包括 Vault 解锁、主机加密存储、SSH 会话管理以及 Host Key 确认流程；但前端仍停留在单会话骨架，接口调用和后端签名也没有完全对齐。MVP 的目标因此收敛为五件事：

1. 正确的保险箱解锁流程
2. 主机管理补全（新增、编辑、删除、搜索）
3. 事件驱动的 Host Key 确认
4. 多标签终端与活跃会话管理
5. 收敛界面，只保留本期真正可用的入口

本文档分为 `MVP 执行计划` 与 `延期路线图` 两部分，避免把未来模块误写成当前架构。

## 当前真实状态

### 已具备

- 后端 `App` 已暴露 `Unlock`、`AddHost`、`ListHosts`、`Connect`、`AcceptHostKey`、`RejectHostKey`、`SendInput`、`ResizeTerminal`、`Disconnect`
- `Service` 已支持 SSH 连接、PTY、stdin/stdout/stderr 转发、Host Key 等待确认、多会话管理
- `Store` 已支持 JSON 持久化以及凭据加密
- 前端已有主机列表、Host 表单、xterm.js 终端、主题和语言上下文

### 本期补齐

- `App.UpdateHost(host, identity) error`
- `App.DeleteHost(hostID string) error`
- `App.ListSessions() []service.Session`
- `Store.DeleteHost(hostID string) error`
- 前端多标签终端状态模型
- 主机搜索、编辑、删除确认
- 真正的密码解锁弹窗

## MVP 执行计划

### 1. 基线修正

- 启动时立即调用 `ListHosts()` 和 `ListSessions()`，主机元数据不再依赖解锁后才可见
- 引入独立的 `vaultUnlocked` 状态；是否解锁不再通过连接状态推导
- 解锁流程改为输入主密码后调用 `Unlock(password string)`，成功后允许保存、编辑和连接
- 前端调用严格对齐后端签名：
  - `AddHost(host, identity)`
  - `UpdateHost(host, identity)`
  - `AcceptHostKey(hostID, key)`
- Host Key 不再依赖错误字符串猜测，而是由根组件订阅 `ssh:host-key:confirm` 事件，弹出确认框并回传 key

### 2. 主机管理

- `Host.ID` 作为稳定主键，本期编辑时只读显示，不支持修改
- 编辑表单允许更新 `name/address/port/username/password/privateKey`
- 为避免前端拿不到加密后的旧凭据，编辑时如果密码或私钥留空，后端默认保留现有凭据
- 删除主机前先检查该主机是否仍有活跃会话；如果有，则直接阻止并提示先关闭标签
- 搜索只做前端本地过滤，不增加 `SearchHosts()` 后端 API

### 3. 多标签终端与会话管理

- 前端状态从单 `sessionId` 升级为 `sessionTabs[] + activeSessionId`
- 每次连接都创建一个独立标签，允许同一主机存在多个并发标签
- 使用单一 xterm 实例承载当前活跃标签，同时为每个 session 维护内存缓冲区，切换标签时重放输出
- 标签关闭时调用 `Disconnect(sessionID)`；如果关闭的是当前标签，则自动切换到最近的其他标签
- 收到 `term:closed:{sessionID}` 事件后，前端自动移除对应标签

### 4. 界面收敛

- 顶栏保留品牌、主机搜索、主题切换、解锁状态和“新建主机”
- 侧栏改为状态面板，不再保留未实现模块的伪导航入口
- 内容区聚焦三块：主机列表、会话标签栏、终端区
- SFTP、端口转发、代码片段、设置中心仅保留在文档路线图中，不占用主流程 UI

## 测试与验收

### Go 单元测试

- `App.UpdateHost/DeleteHost/ListSessions` 绑定行为
- `Store.DeleteHost` 删除主机后不可再读取 identity
- `Service.UpdateHost` 在空凭据输入下保留原有加密数据
- `Service.DeleteHost` 在存在活跃会话时返回错误

### 前端自动化测试

- 解锁弹窗提交主密码
- HostForm 在新增和编辑模式下正确拆分 `host` 与 `identity`
- 多标签终端切换与关闭
- Host Key 事件驱动确认流程

### 基线命令

- `go test ./...`
- `npm run test`
- `npm run build`

## 延期路线图

以下能力明确延期到 MVP 之后，不在本期预埋空接口：

- SFTP 文件浏览与传输
- SSH 端口转发
- 代码片段管理
- 后端持久化设置中心
- 主机分组、批量导入导出、会话恢复、标签持久化

## 默认约束

- 本期仍以 Wails 单窗口桌面应用为目标
- 主机编辑不支持修改 ID
- 编辑时留空密码或私钥表示“保留现状”，不是“清空凭据”
