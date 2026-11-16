@echo off
rem Real67 Studio'yu acar: arka plan servisi + web arayuzu (http://localhost:8667).
rem Bu pencere acik kaldigi surece efekt akar. Pencere olmadan calistirmak icin
rem "arka-planda-baslat.vbs" dosyasini kullanin.
rem Klasorler:  web-app = arayuz dosyalari,  service = arka plan servisi
cd /d "%~dp0.."
set PORT=8667
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. Arka plan servisi icin Node.js gerekir: https://nodejs.org
  echo Yalnizca web arayuzu aciliyor ^(efektler sekme acikken oynar^).
  start "" "http://localhost:%PORT%/"
  python web-app\serve.py %PORT%
  goto :eof
)
set NEEDINSTALL=
if not exist service\node_modules\node-hid set NEEDINSTALL=1
if not exist service\node_modules\koffi set NEEDINSTALL=1
if defined NEEDINSTALL (
  echo Bagimliliklar yukleniyor...
  pushd service
  call npm install --no-audit --no-fund
  popd
)
start "" "http://localhost:%PORT%/"
node service\service.mjs %PORT%
