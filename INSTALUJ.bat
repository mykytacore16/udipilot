@echo off
setlocal EnableExtensions
chcp 65001 >nul
title UDIPilot - instalacja
cd /d "%~dp0"

echo.
echo  ===============================================
echo    UDIPilot - instalacja jednym kliknieciem
echo  ===============================================
echo.

rem ---------- 1. Node.js ----------
call :check_node
if errorlevel 1 (
  echo [1/4] Brak Node.js 22.5+ - instaluje przez winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  Nie znaleziono winget. Zainstaluj Node.js LTS recznie: https://nodejs.org
    echo  a potem uruchom INSTALUJ.bat ponownie.
    start "" https://nodejs.org/
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%ProgramFiles%\nodejs"
  call :check_node
  if errorlevel 1 (
    echo.
    echo  Node.js zostal zainstalowany, ale wymaga ponownego otwarcia okna.
    echo  Zamknij to okno i uruchom INSTALUJ.bat jeszcze raz.
    pause
    exit /b 1
  )
) else (
  echo [1/4] Node.js jest zainstalowany.
)

rem ---------- 2. Biblioteki, interfejs, dane demo ----------
echo [2/4] Instaluje biblioteki i buduje aplikacje (ok. 1-2 min)...
call npm run setup
if errorlevel 1 (
  echo.
  echo  Blad podczas instalacji. Sprawdz polaczenie z internetem i sprobuj ponownie.
  pause
  exit /b 1
)

rem ---------- 3. Opcjonalnie lokalny model AI ----------
echo.
echo [3/4] Lokalny model AI Bielik (opcjonalnie, ok. 5 GB, dziala bez internetu).
echo       Aplikacja dziala tez bez niego. Model mozna podlaczyc pozniej przyciskiem "Podlacz AI".
choice /c TN /n /m "      Zainstalowac Ollama i pobrac Bielika teraz? [T/N] "
if errorlevel 2 goto skip_ai
where ollama >nul 2>nul
if errorlevel 1 (
  winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Ollama"
)
where ollama >nul 2>nul
if errorlevel 1 (
  echo  Nie udalo sie zainstalowac Ollama. Pobierz ja z https://ollama.com i uzyj przycisku "Podlacz AI".
  goto skip_ai
)
start "" /min ollama serve
timeout /t 3 /nobreak >nul
ollama pull SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0
if not exist data mkdir data
if not exist data\settings.json (
  > data\settings.json echo {"provider":"ollama","model":"SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0","baseUrl":"http://127.0.0.1:11434/v1","apiKey":"","cloudAccepted":false}
)
:skip_ai

rem ---------- 4. Skrot na pulpicie i start ----------
echo [4/4] Tworze skrot "UDIPilot" na pulpicie...
if not defined UDIP_TEST powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\UDIPilot.lnk'); $s.TargetPath='%~dp0URUCHOM.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,13'; $s.Save()" >nul 2>nul

echo.
echo  Gotowe! Aplikacja uruchamia sie: http://localhost:3000
echo  Kolejne uruchomienia: skrot "UDIPilot" na pulpicie lub URUCHOM.bat
echo.
if not defined UDIP_TEST call "%~dp0URUCHOM.bat"
exit /b 0

:check_node
where node >nul 2>nul || exit /b 1
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"
exit /b %errorlevel%
