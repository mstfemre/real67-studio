@echo off
rem Real67 Studio kurulumu. Format sonrasi ya da yeni bilgisayarda bir kez calistirin.
rem  1) Node.js var mi diye bakar
rem  2) Servisin bagimliligini (node-hid) kurar
rem  3) Baslat menusune "Real67 Studio" kisayolu ekler
rem  4) Isterseniz Windows acilisinda otomatik baslatmayi kurar
rem  5) Servisi baslatip arayuzu acar
setlocal
cd /d "%~dp0"
echo.
echo  Real67 Studio kurulumu
echo  ----------------------

where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js bulunamadi.
  echo      https://nodejs.org adresinden LTS surumunu kurun, sonra bu dosyayi yeniden calistirin.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

echo  [1/4] Bagimliliklar kuruluyor...
pushd service
call npm install --no-audit --no-fund >nul 2>nul
popd
if not exist "service\node_modules\node-hid" (
  echo  [!] node-hid kurulamadi. Internet baglantinizi kontrol edip yeniden deneyin.
  pause
  exit /b 1
)

echo  [2/4] Baslat menusu kisayolu ekleniyor...
powershell -NoProfile -Command "$d='%~dp0'.TrimEnd('\'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Programs')+'\Real67 Studio.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments='\"'+$d+'\web-app-ac.vbs\"'; $s.WorkingDirectory=$d; $s.IconLocation=$d+'\real67.ico,0'; $s.Save()"

echo  [3/4] Otomatik baslatma
choice /c EH /n /m "        Windows acilinca kendiliginden baslasin mi? (E/H) "
if errorlevel 2 goto :skipauto
powershell -NoProfile -Command "$d='%~dp0'.TrimEnd('\'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Real67 Studio.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments='\"'+$d+'\arka-planda-baslat.vbs\"'; $s.WorkingDirectory=$d; $s.Save()"
echo        Otomatik baslatma kuruldu.
:skipauto

echo  [4/4] Servis baslatiliyor ve arayuz aciliyor...
wscript "%~dp0web-app-ac.vbs"

echo.
echo  Tamam. Arayuz: http://localhost:8667
echo  Bundan sonra Baslat menusunden "Real67 Studio" ile acabilirsiniz.
echo.
pause
