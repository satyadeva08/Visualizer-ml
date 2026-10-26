@echo off
:: VISUALISER - start all three services in separate windows.
::   start.bat            normal demo
::   start.bat collect    also enable the "Collect training clips" tool
setlocal
set "ROOT=%~dp0"
set COLLECT=0
if /i "%1"=="collect" set COLLECT=1

if not exist "%ROOT%ml-service\.venv\Scripts\python.exe" (
  echo [!] Run setup.ps1 first.
  exit /b 1
)
if not defined FFMPEG_PATH (
  for /d %%P in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*") do for /d %%D in ("%%P\ffmpeg-*") do if exist "%%D\bin\ffmpeg.exe" set "FFMPEG_PATH=%%D\bin\ffmpeg.exe"
)
if defined FFMPEG_PATH for %%F in ("%FFMPEG_PATH%") do set "PATH=%%~dpF;%PATH%"
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [!] ffmpeg was not found on PATH. Install it:  winget install Gyan.FFmpeg
  echo     then close and reopen this terminal.
  pause & exit /b 1
)

echo Starting ML service (127.0.0.1:5000) ...
start "VISUALISER - ML service" cmd /k "cd /d "%ROOT%ml-service" && set "ENABLE_COLLECT=%COLLECT%"&& .venv\Scripts\python.exe -m flask --app service/app.py run --host 127.0.0.1 --port 5000"
timeout /t 3 /nobreak >nul

echo Starting Go backend (127.0.0.1:8080) ...
start "VISUALISER - Go backend" cmd /k "cd /d "%ROOT%backend-go" && set "ENABLE_COLLECT=%COLLECT%"&& go run ."
timeout /t 3 /nobreak >nul

echo Starting frontend (Vite) ...
start "VISUALISER - Frontend" cmd /k "cd /d "%ROOT%web" && npm run dev"

echo.
echo  Open: http://localhost:5173   (or the https:// LAN URL Vite prints, for the phone)
echo  Health: http://localhost:8080/api/v1/health
