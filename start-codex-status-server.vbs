Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
server = folder & "\status-server.js"
nodePath = "C:\Program Files\nodejs\node.exe"

If fso.FileExists(nodePath) Then
  shell.Run """" & nodePath & """ """ & server & """", 0, False
Else
  shell.Run "cmd /c node """ & server & """", 0, False
End If
