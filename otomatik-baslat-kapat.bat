@echo off
rem Real67 Studio'nun oturum acilisinda kendiliginden baslamasini kapatir.
powershell -NoProfile -Command "Remove-Item -ErrorAction SilentlyContinue ([Environment]::GetFolderPath('Startup')+'\Real67 Studio.lnk')"
echo Tamam: otomatik baslatma kapatildi.
pause
