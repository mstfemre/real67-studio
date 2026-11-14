#!/usr/bin/env bash
# Real67 Studio kurulumu (Linux / Omarchy).
#  1) Node.js var mı diye bakar
#  2) Servisin bağımlılıklarını (node-hid) kurar
#  3) udev kuralını kurar (klavyeye root olmadan erişim; sudo ister)
#  4) systemd kullanıcı servisini ve uygulama menüsü kısayolunu ekler
#  5) İsterseniz oturum açılınca otomatik başlatmayı açar
#  6) Servisi başlatıp arayüzü açar
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
DIR="$PWD"
UNIT=real67-studio.service
UNIT_DIR="$HOME/.config/systemd/user"
APP_DIR="$HOME/.local/share/applications"

echo
echo " Real67 Studio kurulumu"
echo " ----------------------"

NODE="$(command -v node || true)"
if [[ -z $NODE ]]; then
  echo " [!] Node.js bulunamadı. Kurun:  omarchy pkg add nodejs npm"
  exit 1
fi

echo " [1/5] Bağımlılıklar kuruluyor..."
(cd service && npm install --no-audit --no-fund --omit=optional >/dev/null)
[[ -d service/node_modules/node-hid ]] || { echo " [!] node-hid kurulamadı."; exit 1; }

echo " [2/5] udev kuralı kuruluyor (sudo)..."
if ! cmp -s linux/70-real67.rules /etc/udev/rules.d/70-real67.rules 2>/dev/null; then
  sudo install -m 644 linux/70-real67.rules /etc/udev/rules.d/70-real67.rules
  sudo udevadm control --reload-rules
  sudo udevadm trigger --attr-match=idVendor=0416 --attr-match=idProduct=0112 || true
  sudo udevadm trigger --subsystem-match=hidraw --subsystem-match=input || true
fi

echo " [3/5] Servis ve menü kısayolu ekleniyor..."
mkdir -p "$UNIT_DIR" "$APP_DIR"
cat >"$UNIT_DIR/$UNIT" <<UNITEOF
[Unit]
Description=Real67 Studio (MelGeek Real67 ışık servisi)

[Service]
WorkingDirectory=$DIR
ExecStart=$NODE $DIR/service/service.mjs 8667
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNITEOF
systemctl --user daemon-reload

cat >"$APP_DIR/real67-studio.desktop" <<DESKEOF
[Desktop Entry]
Type=Application
Name=Real67 Studio
Comment=MelGeek Real67 ışık efektleri
Exec=$DIR/ac.sh
Icon=$DIR/linux/real67.png
Terminal=false
Categories=Utility;
DESKEOF

echo " [4/5] Otomatik başlatma"
read -rp "        Oturum açılınca kendiliğinden başlasın mı? (E/H) " ans
if [[ ${ans,,} == e* ]]; then
  systemctl --user enable "$UNIT" >/dev/null 2>&1
  echo "        Otomatik başlatma açıldı."
else
  systemctl --user disable "$UNIT" >/dev/null 2>&1 || true
fi

echo " [5/5] Servis başlatılıyor ve arayüz açılıyor..."
systemctl --user restart "$UNIT"
"$DIR/ac.sh"

echo
echo " Tamam. Arayüz: http://localhost:8667"
echo " Bundan sonra uygulama menüsünden (Super+Space) \"Real67 Studio\" ile açabilirsiniz."
