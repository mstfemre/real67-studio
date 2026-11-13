@echo off
rem Windows oturumu acilinca Real67 Studio servisini kendiliginden baslatir.
rem Baslangic klasorune "arka-planda-baslat.vbs" icin bir kisayol koyar.
rem Geri almak icin: otomatik-baslat-kapat.bat
rem ONEMLI: bu klasoru tasirsaniz bu dosyayi yeniden calistirin.
cd /d "%~dp0"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Real67 Studio.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments='\"%~dp0arka-planda-baslat.vbs\"'; $s.WorkingDirectory='%~dp0'; $s.Save()"
if errorlevel 1 (echo Kisayol olusturulamadi.) else (echo Tamam: Real67 Studio artik oturum acilinca baslayacak.)
pause
