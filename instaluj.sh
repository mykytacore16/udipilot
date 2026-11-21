#!/usr/bin/env bash
# UDIPilot – instalacja jednym poleceniem (macOS / Linux):  ./instaluj.sh
set -e
cd "$(dirname "$0")"
echo
echo "  UDIPilot – instalacja"
echo

node_ok() { command -v node >/dev/null 2>&1 && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"; }

if ! node_ok; then
  echo "[1/4] Brak Node.js 22.5+."
  if command -v brew >/dev/null 2>&1; then
    brew install node
  else
    echo "      Zainstaluj Node.js LTS: https://nodejs.org (lub menedżerem pakietów) i uruchom ponownie ./instaluj.sh"
    exit 1
  fi
else
  echo "[1/4] Node.js jest zainstalowany."
fi

echo "[2/4] Instaluję biblioteki i buduję aplikację…"
npm run setup

echo
echo "[3/4] Lokalny model AI Bielik (opcjonalnie, ok. 5 GB). Można go też podłączyć później przyciskiem „Podłącz AI”."
read -r -p "      Zainstalować Ollama i pobrać Bielika teraz? [t/N] " ans
if [[ "$ans" =~ ^[TtYy]$ ]]; then
  if ! command -v ollama >/dev/null 2>&1; then
    if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then brew install ollama
    else curl -fsSL https://ollama.com/install.sh | sh; fi
  fi
  (ollama serve >/dev/null 2>&1 &) ; sleep 3
  ollama pull SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0
  mkdir -p data
  [ -f data/settings.json ] || echo '{"provider":"ollama","model":"SpeakLeash/bielik-4.5b-v3.0-instruct:Q8_0","baseUrl":"http://127.0.0.1:11434/v1","apiKey":"","cloudAccepted":false}' > data/settings.json
fi

echo "[4/4] Gotowe. Uruchamiam: http://localhost:3000"
exec ./uruchom.sh
