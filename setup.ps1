$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
foreach ($command in 'py', 'node', 'npm', 'go') {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Install $command and reopen PowerShell." }
}
py -3 -m venv ml-service/.venv
if ($LASTEXITCODE) { throw 'Python environment creation failed.' }
& ./ml-service/.venv/Scripts/python.exe -m pip install -r ml-service/requirements-dev.txt
if ($LASTEXITCODE) { throw 'Python dependency installation failed.' }
Push-Location web
try {
    npm ci
    if ($LASTEXITCODE) { throw 'Frontend dependency installation failed.' }
} finally { Pop-Location }
Write-Host 'Dependencies installed. Ensure FFmpeg is on PATH (or set FFMPEG_PATH), then run start.bat collect.'
