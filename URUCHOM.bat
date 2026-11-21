@echo off
setlocal
chcp 65001 >nul
title UDIPilot - serwer (zamknij to okno, aby zatrzymac)
cd /d "%~dp0"

if not exist client\dist\index.html (
  echo Aplikacja nie jest zainstalowana - uruchamiam INSTALUJ.bat...
  call "%~dp0INSTALUJ.bat"
  exit /b
)

rem Jesli serwer juz dziala - tylko otworz przegladarke
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:3000/api/status | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  start "" http://localhost:3000
  exit /b 0
)

rem Lokalny model AI (jesli zainstalowany) - uruchom w tle
where ollama >nul 2>nul && (tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul || start "" /min ollama serve)

echo.
echo  UDIPilot dziala: http://localhost:3000
echo  Nie zamykaj tego okna, dopoki pracujesz w aplikacji.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://localhost:3000'"
node server/index.js
pause
