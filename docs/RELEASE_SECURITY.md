# 发布签名与来源验证

Release workflow 始终为发布产物生成 SHA-256 文件和 GitHub artifact provenance。平台代码签名在仓库配置对应 GitHub Actions secrets 后自动启用；缺少全部证书配置时仍可构建未签名产物。

## Windows Authenticode

配置以下 repository secrets：

- `WINDOWS_CERTIFICATE_BASE64`：PFX 证书文件的 Base64 内容。
- `WINDOWS_CERTIFICATE_PASSWORD`：PFX 证书密码。

Workflow 在压缩前签名 `ZenTerm.exe`，使用 DigiCert 时间戳服务，并要求 `Set-AuthenticodeSignature` 返回 `Valid`。

## macOS Developer ID 与 notarization

配置以下 repository secrets：

- `APPLE_CERTIFICATE_BASE64`：Developer ID Application `.p12` 文件的 Base64 内容。
- `APPLE_CERTIFICATE_PASSWORD`：`.p12` 密码。
- `APPLE_SIGNING_IDENTITY`：完整签名身份，例如 `Developer ID Application: Example (TEAMID)`。
- `APPLE_ID`：用于 notarization 的 Apple ID。
- `APPLE_TEAM_ID`：Apple Developer Team ID。
- `APPLE_APP_PASSWORD`：Apple ID app-specific password。

Workflow 使用临时 keychain 导入证书，对应用启用 hardened runtime 签名，提交 `notarytool`，将公证票据 staple 到 `.app` 后重新打包。任务结束时会删除临时 keychain。

## 用户侧验证

验证 SHA-256：

```bash
shasum -a 256 -c ZenTerm-VERSION-macos-universal.zip.sha256
```

验证 GitHub 构建来源：

```bash
gh attestation verify ZenTerm-VERSION-macos-universal.zip --repo yml2213/ZenTerm
```

验证平台签名：

```bash
codesign --verify --deep --strict --verbose=2 ZenTerm.app
spctl --assess --type execute --verbose=2 ZenTerm.app
```

```powershell
Get-AuthenticodeSignature .\ZenTerm.exe | Format-List Status,SignerCertificate,TimeStamperCertificate
```
