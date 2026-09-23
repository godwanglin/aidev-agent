!macro customInstall
  DetailPrint "Configuring Aidev NPM runtime..."
  nsExec::Exec 'cmd.exe /c mklink /J "$INSTDIR\resources\npm\node_modules" "$INSTDIR\resources\npm\vendor"'

  DetailPrint "Registering Aidev CLI to PATH..."
  ReadRegStr $0 HKCU "Environment" "Path"
  StrCmp $0 "" empty_path
  WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
  Goto end_path
empty_path:
  WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
end_path:
  SendMessage 0xffff 0x001A 0 "STR:Environment" /TIMEOUT=5000
  
  DetailPrint "Registering aidev:// protocol handler..."
  WriteRegStr HKCR "aidev" "" "URL:Aidev Protocol"
  WriteRegStr HKCR "aidev" "URL Protocol" ""
  WriteRegStr HKCR "aidev\DefaultIcon" "" "$INSTDIR\Aidev.exe,0"
  WriteRegStr HKCR "aidev\shell\open\command" "" '"$INSTDIR\Aidev.exe" "%1"'
!macroend

!macro customUnInstall
  DetailPrint "Cleaning Aidev NPM runtime link..."
  nsExec::Exec 'cmd.exe /c rmdir "$INSTDIR\resources\npm\node_modules"'

  DetailPrint "Removing aidev:// protocol handler..."
  DeleteRegKey HKCR "aidev"

  DetailPrint "Removing Aidev CLI from PATH..."
  nsExec::Exec 'powershell -NoProfile -WindowStyle Hidden -Command "$$p = [Environment]::GetEnvironmentVariable(\"Path\", \"User\"); if ($$p) { $$n = ($$p -split \";\" | Where-Object { $$_ -ne \"$INSTDIR\" -and $$_ -ne \"\" }) -join \";\"; [Environment]::SetEnvironmentVariable(\"Path\", $$n, \"User\") }"'

  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO "Apakah Anda ingin menghapus seluruh data pengaturan, riwayat chat, dan cache (~/.aidev) agar bersih total dari PC ini?" /SD IDNO IDNO SkipDelete
    RMDir /r "$PROFILE\.aidev"
    RMDir /r "$PROFILE\.cache\aidev-runtimes"
    RMDir /r "$APPDATA\Aidev Desktop"
    RMDir /r "$LOCALAPPDATA\aidev-desktop-updater"
  SkipDelete:
  ${endIf}
!macroend
