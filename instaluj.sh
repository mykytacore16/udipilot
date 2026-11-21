#!/usr/bin/env bash
# UDIPilot – instalator (macOS / Linux):  ./instaluj.sh  → kreator otwiera się w przeglądarce
cd "$(dirname "$0")"
node_ok() { command -v node >/dev/null 2>&1 && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"; }
if ! node_ok; then
  echo "Instaluję Node.js…"
  if command -v brew >/dev/null 2>&1; then brew install node
  else echo "Zainstaluj Node.js LTS: https://nodejs.org i uruchom ponownie ./instaluj.sh"; exit 1; fi
fi
exec node installer/installer.js
