#!/usr/bin/env bash
# UDIPilot – uruchomienie:  ./uruchom.sh   (Ctrl+C zatrzymuje serwer)
cd "$(dirname "$0")"
[ -f client/dist/index.html ] || exec ./instaluj.sh
command -v ollama >/dev/null 2>&1 && ! pgrep -x ollama >/dev/null && (ollama serve >/dev/null 2>&1 &)
URL=http://localhost:3000
[ -n "$UDIP_NO_BROWSER" ] || ( sleep 2; if command -v open >/dev/null; then open $URL; elif command -v xdg-open >/dev/null; then xdg-open $URL >/dev/null 2>&1; fi ) &
echo "UDIPilot działa: $URL  (Ctrl+C – zatrzymaj)"
exec node server/index.js
