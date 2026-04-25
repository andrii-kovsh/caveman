Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

url = "http://127.0.0.1:8765"
edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
edgeAlt = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
chromeAlt = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
args = "--app=" & url

If fso.FileExists(edge) Then
  shell.Run """" & edge & """ " & args, 1, False
ElseIf fso.FileExists(edgeAlt) Then
  shell.Run """" & edgeAlt & """ " & args, 1, False
ElseIf fso.FileExists(chrome) Then
  shell.Run """" & chrome & """ " & args, 1, False
ElseIf fso.FileExists(chromeAlt) Then
  shell.Run """" & chromeAlt & """ " & args, 1, False
Else
  shell.Run url, 1, False
End If
