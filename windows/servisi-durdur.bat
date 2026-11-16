@echo off
rem Arka planda calisan Real67 Studio servisini durdurur; klavye onceki isigina doner.
curl -s -X POST -H "Content-Type: application/json" -d "{}" http://localhost:8667/api/quit >nul 2>nul
if errorlevel 1 (echo Servis calismiyor.) else (echo Servis durduruldu.)
timeout /t 2 >nul
