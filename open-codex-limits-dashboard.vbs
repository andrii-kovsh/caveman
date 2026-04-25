Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
dashboard = folder & "\codex-limits-dashboard.html"
shell.Run "cmd /c start """" """ & dashboard & """", 0, False
