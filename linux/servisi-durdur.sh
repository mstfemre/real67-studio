#!/usr/bin/env bash
# Servisi durdurur ve efekti bırakır; klavye önceki ışığına döner.
# (systemctl --user stop ise efekti hatırlar, bir sonraki başlatmada sürer.)
curl -fs -m 2 -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8667/api/quit >/dev/null && echo "Servis durduruldu." || echo "Servis çalışmıyor."
sleep 1
systemctl --user stop real67-studio.service 2>/dev/null || true
