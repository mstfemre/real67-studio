#!/usr/bin/env bash
# Real67 Studio'yu kaldırır: servisi durdurur, servis/menü/udev dosyalarını siler. Klasörü silmez.
"$(dirname "$(readlink -f "$0")")/servisi-durdur.sh" >/dev/null
systemctl --user disable real67-studio.service >/dev/null 2>&1 || true
rm -f "$HOME/.config/systemd/user/real67-studio.service" "$HOME/.local/share/applications/real67-studio.desktop"
systemctl --user daemon-reload
if [[ -f /etc/udev/rules.d/70-real67.rules ]]; then
  sudo rm -f /etc/udev/rules.d/70-real67.rules && sudo udevadm control --reload-rules
fi
echo "Kaldırıldı. Klavye kendi belleğindeki ışığa döner."
