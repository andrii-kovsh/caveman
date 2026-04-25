Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
server = folder & "\status-server.js"
nodePath = "C:\Program Files\nodejs\node.exe"
opener = folder & "\open-codex-dashboard-low-gpu.vbs"
If fso.FileExists(nodePath) Then
  shell.Run """" & nodePath & """ """ & server & """", 0, False
Else
  shell.Run "cmd /c node """ & server & """", 0, False
End If
WScript.Sleep 900
If fso.FileExists(opener) Then
  shell.Run "wscript.exe """ & opener & """", 0, False
Else
  shell.Run "http://127.0.0.1:8765", 1, False
End If
