# 连接历史日志计划

## 目标

为 ZenTerm 增加一个轻量、可检索的连接历史日志页，用来记录每一次 SSH 连接的生命周期和结果。第一版只记录连接元数据，不记录终端内容、命令输出或文件内容，降低隐私和安全风险。

## 非目标

- 不保存终端屏幕内容。
- 不保存用户输入的命令。
- 不保存 SFTP 文件内容。
- 不做命令审计、回放、录屏或全文搜索。
- 不改变现有 `Connect`、`Disconnect`、多标签终端的主流程体验。

终端内容日志、命令审计和会话回放后续单独规划，必须默认关闭，并提供明确的加密、清理和主机级开关。

## 第一版范围

### 记录内容

每条日志代表一次连接尝试或一次连接会话。

建议字段：

```go
type SessionLog struct {
    ID             string    `json:"id"`
    SessionID      string    `json:"session_id,omitempty"`
    HostID         string    `json:"host_id"`
    HostName       string    `json:"host_name,omitempty"`
    HostAddress    string    `json:"host_address"`
    HostPort       int       `json:"host_port"`
    SSHUsername    string    `json:"ssh_username"`
    LocalUsername  string    `json:"local_username,omitempty"`
    Protocol       string    `json:"protocol"` // ssh
    Status         string    `json:"status"`   // connecting, active, closed, failed, rejected
    StartedAt      time.Time `json:"started_at"`
    EndedAt        time.Time `json:"ended_at,omitempty"`
    DurationMillis int64     `json:"duration_millis,omitempty"`
    RemoteAddr     string    `json:"remote_addr,omitempty"`
    ErrorMessage   string    `json:"error_message,omitempty"`
    Favorite       bool      `json:"favorite,omitempty"`
    Note           string    `json:"note,omitempty"`
}
```

字段说明：

- `HostName`、`HostAddress`、`HostPort`、`SSHUsername` 使用连接当时的快照，避免主机后续改名后历史记录失真。
- `Status` 区分成功、失败、进行中、正常关闭和指纹拒绝。
- `ErrorMessage` 只保存面向用户的错误摘要，不保存敏感凭据或底层堆栈。
- `Favorite` 用于标记重要记录，和主机收藏互不影响。

### 写入时机

- 用户点击连接后，创建一条 `connecting` 日志。
- `Connect` 成功返回 session ID 后，将日志更新为 `active`，写入 `session_id`、`remote_addr`。
- `Disconnect` 主动断开后，将日志更新为 `closed`，写入 `ended_at` 和持续时间。
- 后端会话自然关闭或运行时事件关闭时，同样补 `closed`。
- 连接失败时，将日志更新为 `failed`，写入 `error_message` 和 `ended_at`。
- Host Key 被拒绝时，将日志更新为 `rejected`。

### 展示页面

左侧导航增加「日志」，与主机、钥匙串、已知主机同级。

页面采用紧凑表格，不使用大卡片：

| 日期 | 用户 | 主机 | 状态 | 收藏 |
| --- | --- | --- | --- | --- |
| 2026年4月14日 23:02 - 07:24 | yml / ubuntu | Production Web, ssh | 已关闭 | ☆ |

交互：

- 按时间倒序展示。
- 顶部工具栏放筛选控件：全部、成功、失败、进行中、收藏。
- 支持按主机名、地址、SSH 用户搜索。
- 点击一条记录，选中对应主机并打开详情或弹出记录详情。
- 双击成功记录，尝试重新连接该主机。
- 收藏按钮只收藏日志记录。

空状态：

- 无日志时显示「连接后会在这里生成历史记录」。
- 不显示冗长解释文案。

## 后端设计

### 模型

在 `internal/model/types.go` 新增 `SessionLog`。

状态常量建议：

```go
const (
    SessionLogStatusConnecting = "connecting"
    SessionLogStatusActive     = "active"
    SessionLogStatusClosed     = "closed"
    SessionLogStatusFailed     = "failed"
    SessionLogStatusRejected   = "rejected"
)
```

### 存储

在 JSON store 的 `fileData` 增加：

```go
SessionLogs []model.SessionLog `json:"session_logs,omitempty"`
```

新增 Store 方法：

- `CreateSessionLog(log model.SessionLog) error`
- `UpdateSessionLog(log model.SessionLog) error`
- `ListSessionLogs(limit int) ([]model.SessionLog, error)`
- `ToggleSessionLogFavorite(logID string, favorite bool) error`
- `DeleteSessionLog(logID string) error`
- `PruneSessionLogs(maxEntries int) error`

第一版可以先不做删除 UI，但后端留出清理能力。

### Service

Service 负责把连接生命周期映射到日志：

- `Connect(hostID)` 内部创建或更新日志。
- 会话关闭路径补 `ended_at`。
- Host Key 等待确认期间日志保持 `connecting`。
- `AcceptHostKey` 后如果连接继续成功，再更新为 `active`。
- `RejectHostKey` 更新为 `rejected`。

需要维护 `sessionID -> logID` 映射，便于关闭时定位日志。

### Wails API

新增 App 方法：

- `ListSessionLogs(limit int) ([]SessionLog, error)`
- `ToggleSessionLogFavorite(logID string, favorite bool) error`
- `DeleteSessionLog(logID string) error`

前端绑定：

- `listSessionLogs(limit = 200)`
- `toggleSessionLogFavorite(logID, favorite)`
- `deleteSessionLog(logID)`

## 前端设计

### 导航

`frontend/src/lib/appShellConfig.jsx`：

- 增加 `logs` 导航项。
- 图标可用 `Activity` 或 `History`。

`useAppState.js`：

- 增加 `isLogsPage`。
- 增加日志筛选状态：`logFilterKey`、`logSearchQuery`。

`VaultWorkspace.jsx`：

- 增加日志页渲染分支。
- 顶部栏直接放搜索和筛选，不放标题说明。

### 组件

新增：

- `frontend/src/components/SessionLogPanel.jsx`
- `frontend/src/styles/session-log.css`

`SessionLogPanel` 负责：

- 加载日志。
- 本地筛选和搜索。
- 表格渲染。
- 收藏切换。
- 记录详情轻量展开或右侧抽屉。

表格列：

- 时间：日期 + 开始结束时间。
- 用户：SSH 用户 + 本机用户。
- 主机：主机快照 + `ssh` 标签。
- 状态：active / closed / failed / rejected。
- 收藏：图标按钮。

### 样式方向

- 遵循当前工具型界面，密集、可扫读。
- 不做营销式标题区。
- 顶部高度使用现有 `--app-panel-bar-height`。
- 表格行高度固定，文本溢出省略。
- 深浅色主题共用现有变量。

## 隐私与安全

第一版默认记录元数据，因为它不包含密钥和终端内容，但仍需注意：

- 错误信息需要清洗，避免保存密码、私钥路径、token。
- 日志应跟随 Vault reset 一起清空。
- 后续如果引入终端内容日志，必须单独设计：
  - 默认关闭。
  - 主机级开关。
  - 加密存储。
  - 清理策略。
  - 明确 UI 提示。

## 测试计划

后端：

- Store 能创建、更新、列出、收藏日志。
- `ResetVault` 清空日志。
- `Connect` 成功会创建 active 日志。
- `Disconnect` 会补 closed 和 duration。
- 连接失败会写 failed。
- Host Key reject 会写 rejected。

前端：

- 左侧出现「日志」入口。
- 日志页空状态正常。
- 有记录时按时间倒序展示。
- 搜索主机、用户、地址生效。
- 状态筛选生效。
- 收藏切换调用后端并更新 UI。
- 双击记录能触发重连。

## 分阶段执行

### 阶段 1：后端数据与 API

1. 新增 `SessionLog` 模型和 Wails DTO。
2. 扩展 JSON store。
3. 添加 Store CRUD 和清理方法。
4. 添加 Service 日志写入路径。
5. 添加 App 绑定方法。
6. 添加后端单元测试。

完成标准：

- 不接前端也能通过 API 查看连接历史。
- 现有连接、断开、Host Key 流程不回退。

### 阶段 2：日志页面

1. 添加导航入口。
2. 新增 `SessionLogPanel`。
3. 实现列表、筛选、搜索、收藏。
4. 实现从日志记录重连。
5. 添加前端测试。

完成标准：

- 日志页可作为日常连接历史使用。
- UI 与现有主机页、钥匙串页密度一致。

### 阶段 3：管理能力

1. 添加日志详情。
2. 添加删除单条记录。
3. 添加保留策略设置：最近 30 天、最近 90 天、最多 N 条。
4. 添加导出 CSV / JSON。

完成标准：

- 用户能控制日志存储规模。
- 日志数据可迁移和排查。

### 后续：终端内容日志

单独立项，不并入连接历史第一版。

建议能力：

- 主机级录制开关。
- 会话录制状态提示。
- 加密存储。
- 自动清理。
- 只读回放。
- 搜索前明确提示敏感风险。

## 推荐先做的最小闭环

最小可交付版本：

1. 后端保存 `SessionLog`。
2. `Connect` 成功和失败都有记录。
3. `Disconnect` 能补结束时间。
4. 前端有「日志」页面。
5. 列表显示日期、用户、主机、状态。
6. 支持点击重新连接。

这个闭环能马上替代单一的 `last_connected_at`，并为后续终端内容日志留下干净边界。
