# 产物安全与自签运行指引

ZenTerm 的 Release workflow 始终为所有发布产物生成 **SHA-256 校验文件** 和 **GitHub Artifact Provenance（官方构建来源与防篡改证明）**。

为了保持完全开源与免依赖，云端构建产物未内置商业付费签名证书。初次下载运行可能触发操作系统的安全保护提示，用户可根据以下说明进行校验、放行或自签名使用。

---

## 一、完整性与构建来源验证

### 1. 校验 SHA-256 哈希

下载压缩包和对应的 `.sha256` 文件后，可在终端运行：

```bash
# macOS / Linux
shasum -a 256 -c ZenTerm-0.1.6-macos-universal.zip.sha256
# 或直接对比哈希
shasum -a 256 ZenTerm-0.1.6-macos-universal.zip
```

```powershell
# Windows PowerShell
(Get-FileHash .\ZenTerm-0.1.6-windows-amd64.zip -Algorithm SHA256).Hash
```

### 2. 验证 GitHub Artifact Provenance

ZenTerm 在 GitHub Actions 中自动生成了数字溯源凭证。如果本机安装了 [GitHub CLI (`gh`)](https://cli.github.com/)，可一键验证产物是否确实由本仓库的官方工作流构建：

```bash
gh attestation verify ZenTerm-0.1.6-macos-universal.zip --repo yml2213/ZenTerm
```

---

## 二、macOS 放行与自签指引

解压后的 `ZenTerm.app` 移动至 `/Applications` 目录后，若双击提示“已损坏，无法打开”或“无法验证开发者”，这是 macOS Gatekeeper 针对未签名下载软件的安全策略。

### 方式 A：移除隔离属性（最简便）

在终端中执行以下命令，移除系统下载隔离标记即可正常打开：

```bash
xattr -cr /Applications/ZenTerm.app
```

> **或者**：在系统“设置” -> “隐私与安全性”底部，找到 ZenTerm 的拦截提示，点击“仍要打开”。

### 方式 B：本地 Ad-Hoc 临时自签

如果你希望为本地二进制补齐签名，可使用系统自带的 `codesign` 进行 Ad-Hoc 自签：

```bash
codesign --force --deep -s - /Applications/ZenTerm.app
```

验证自签结果：

```bash
codesign --verify --deep --strict --verbose=2 /Applications/ZenTerm.app
```

---

## 三、Windows 放行与自签指引

### 方式 A：SmartScreen 弹窗放行

双击 `ZenTerm.exe` 时若弹出 Windows Defender SmartScreen 拦截窗口：
1. 点击弹窗上的 **“更多信息” (More info)**。
2. 点击出现的 **“仍要运行” (Run anyway)** 按钮。

### 方式 B：使用 PowerShell 创建自签名证书签名（可选）

如需在本地对 `ZenTerm.exe` 执行 Authenticode 签名：

```powershell
# 1. 创建本地代码签名自签名证书并信任
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=ZenTermLocal" -CertStoreLocation Cert:\CurrentUser\My
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
$rootStore.Open("ReadWrite")
$rootStore.Add($cert)
$rootStore.Close()

# 2. 为可执行文件签名
Set-AuthenticodeSignature -FilePath ".\ZenTerm.exe" -Certificate $cert -HashAlgorithm SHA256

# 3. 验证签名状态
Get-AuthenticodeSignature .\ZenTerm.exe
```
