#!/usr/bin/env bash
# Real67 Studio arayüzünü açar. Servis çalışmıyorsa önce başlatır;
# Hive için duraklatıldıysa devam ettirir.
URL=http://localhost:8667/studio/
STATUS=http://127.0.0.1:8667/api/status
up() { curl -fs -m 1 "$STATUS" >/dev/null; }
if ! up; then
  systemctl --user start real67-studio.service
  for _ in $(seq 30); do up && break; sleep 0.3; done
fi
curl -fs -m 2 -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8667/api/resume >/dev/null || true
# Masaüstü uygulaması kuruluysa onu aç (desktop/bin/install); servisi kendisi başlatır.
if [ -x "$HOME/.local/bin/real67" ]; then
  setsid -f "$HOME/.local/bin/real67" >/dev/null 2>&1
elif command -v omarchy-launch-webapp >/dev/null; then
  setsid -f omarchy-launch-webapp "$URL" >/dev/null 2>&1
else
  setsid -f xdg-open "$URL" >/dev/null 2>&1
fi
