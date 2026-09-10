$secureKey = Read-Host "请输入 iFinD API Key（输入内容不会显示）" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($plainKey)) {
        throw "API Key 不能为空"
    }
    [Environment]::SetEnvironmentVariable("IFIND_API_KEY", $plainKey.Trim(), "User")
    Write-Host "iFinD API Key 已安全保存。请重新打开 Codex 后继续校验。" -ForegroundColor Green
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plainKey = $null
    $secureKey = $null
}
