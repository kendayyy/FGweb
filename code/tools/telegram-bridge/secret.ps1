param([ValidateSet('Protect','Read')][string]$Mode, [string]$Path)
$ErrorActionPreference = 'Stop'
# Node launched by PowerShell7 inherits its module path; use Windows PowerShell's
# own security module for the DPAPI cmdlets in this isolated helper process.
$env:PSModulePath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/Modules'
$secretRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.runtime/telegram-bridge'))
$secretTarget = [IO.Path]::GetFullPath($Path)
if (-not $secretTarget.StartsWith($secretRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Secret path outside runtime' }
if ($Mode -eq 'Protect') {
    $plainToken = [Console]::In.ReadToEnd().Trim()
    if ($plainToken -notmatch '^\d+:[A-Za-z0-9_-]{25,}$') { throw 'Invalid token format' }
    $protectedToken = ConvertTo-SecureString -String $plainToken -AsPlainText -Force | ConvertFrom-SecureString
    [IO.File]::WriteAllText($secretTarget, $protectedToken)
    $plainToken = $null
} else {
    $secureToken = Get-Content -LiteralPath $secretTarget -Raw | ConvertTo-SecureString
    [Console]::Write(([System.Net.NetworkCredential]::new('', $secureToken)).Password)
}
