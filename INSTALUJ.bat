@echo off
setlocal EnableExtensions
chcp 65001 >nul
title UDIPilot - instalator
cd /d "%~dp0"

rem Kreator instalacji otwiera sie w przegladarce. Ten plik tylko sprawdza Node.js.
call :check_node
if errorlevel 1 (
  echo.
  echo  Instaluje Node.js (wymagany do dzialania aplikacji^)...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo  Nie znaleziono winget. Zainstaluj Node.js LTS z https://nodejs.org i uruchom INSTALUJ.bat ponownie.
    start "" https://nodejs.org/
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  call :check_node
  if errorlevel 1 (
    echo  Node.js zainstalowany - zamknij to okno i uruchom INSTALUJ.bat jeszcze raz.
    pause
    exit /b 1
  )
)

echo.
echo  Otwieram kreator instalacji w przegladarce...
echo  (to okno zamknie sie samo po zakonczeniu)
echo.
node installer\installer.js
exit /b 0

:check_node
where node >nul 2>nul || exit /b 1
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"
exit /b %errorlevel%
