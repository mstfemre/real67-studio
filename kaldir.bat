@echo off
rem Real67 Studio'yu kaldirir: servisi durdurur, kisayollari siler.
rem Klasorun kendisini silmez; isterseniz sonra elle silebilirsiniz.
curl -s -X POST -H "Content-Type: application/json" -d "{}" http://127.0.0.1:8667/api/quit >nul 2>nul
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Startup')+'\Real67 Studio.lnk'), ([Environment]::GetFolderPath('Programs')+'\Real67 Studio.lnk')"
echo Servis durduruldu, kisayollar silindi. Klavye kendi bellegindeki isiga doner.
pause
