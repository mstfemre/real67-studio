' Real67 Studio web arayuzunu acar.
' Servis calismiyorsa once pencere acmadan baslatir, hazir olunca tarayicida acar.
' Servis Hive yuzunden duraklatildiysa devam ettirir (Hive'i kapattiktan sonra tiklayin).
Option Explicit
Const URL = "http://localhost:8667/"
' Durum kontrolu dogrudan IPv4'e: "localhost" once IPv6'yi deneyip ~2 sn bekletiyor
Const STATUS_URL = "http://127.0.0.1:8667/api/status"

Dim fso, sh, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)

Function ServiceUp()
  Dim http
  ServiceUp = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 1000, 1000
  http.Open "GET", STATUS_URL, False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then ServiceUp = True
  End If
  On Error GoTo 0
End Function

If Not ServiceUp() Then
  sh.Run "cmd /c node service\service.mjs 8667 > service\servis.log 2>&1", 0, False
  For i = 1 To 30
    WScript.Sleep 300
    If ServiceUp() Then Exit For
  Next
End If

' Hive icin duraklatilmissa devam ettir
On Error Resume Next
Dim post
Set post = CreateObject("MSXML2.ServerXMLHTTP.6.0")
post.setTimeouts 1000, 1000, 2000, 2000
post.Open "POST", "http://127.0.0.1:8667/api/resume", False
post.setRequestHeader "Content-Type", "application/json"
post.Send "{}"
On Error GoTo 0

sh.Run URL
