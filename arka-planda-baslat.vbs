' Real67 Studio servisini pencere acmadan baslatir.
' Son oynatilan efekt kaldigi yerden surer. Durdurmak icin: servisi-durdur.bat
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c node service\service.mjs 8667 > service\servis.log 2>&1", 0, False
