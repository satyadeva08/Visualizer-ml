$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not $env:FFMPEG_PATH -and -not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    $candidate = Get-ChildItem "$env:LOCALAPPDATA/Microsoft/WinGet/Packages/Gyan.FFmpeg_*/ffmpeg-*/bin/ffmpeg.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) { $env:FFMPEG_PATH = $candidate.FullName }
}
if ($env:FFMPEG_PATH) { $env:PATH = (Split-Path $env:FFMPEG_PATH) + ';' + $env:PATH }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'FFmpeg is required for the complete test suite. Set FFMPEG_PATH or add it to PATH.' }
& ./ml-service/.venv/Scripts/python.exe -m pytest ml-service -q
if ($LASTEXITCODE) { throw 'Python tests failed.' }
Push-Location backend-go
try { go test ./...; if ($LASTEXITCODE) { throw 'Go tests failed.' } } finally { Pop-Location }
Push-Location web
try {
    npm test
    if ($LASTEXITCODE) { throw 'Frontend tests failed.' }
    npm run build
    if ($LASTEXITCODE) { throw 'Production build failed.' }
} finally { Pop-Location }
Write-Host 'Software checks passed. Real-sign evaluation and camera testing are separate requirements.'
