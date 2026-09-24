!macro customInstallMode
  ${if} ${isUpdated}
    ${if} $hasPerMachineInstallation == "1"
      StrCpy $isForceMachineInstall "1"
    ${else}
      StrCpy $isForceCurrentInstall "1"
    ${endIf}
  ${endIf}
!macroend

!macro customInstall
  SetDetailsPrint both
  DetailPrint "Menyelesaikan pemasangan file Aidev Desktop..."

  ${ifNot} ${isUpdated}
    DetailPrint "Registering Aidev CLI to PATH..."
    ReadRegStr $0 HKCU "Environment" "Path"
    StrCmp $0 "" empty_path
    WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR"
    Goto end_path
  empty_path:
    WriteRegExpandStr HKCU "Environment" "Path" "$INSTDIR"
  end_path:
    SendMessage 0xffff 0x001A 0 "STR:Environment" /TIMEOUT=500
  ${endIf}

  DetailPrint "Registering aidev:// protocol handler..."
  WriteRegStr HKCU "Software\Classes\aidev" "" "URL:Aidev Protocol"
  WriteRegStr HKCU "Software\Classes\aidev" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\aidev\DefaultIcon" "" "$INSTDIR\Aidev.exe,0"
  WriteRegStr HKCU "Software\Classes\aidev\shell\open\command" "" '"$INSTDIR\Aidev.exe" "%1"'

  ${if} ${isUpdated}
    DetailPrint "Membuka kembali Aidev Desktop..."
    HideWindow
    Exec '"$INSTDIR\Aidev.exe" --updated'
    !insertmacro quitSuccess
  ${endIf}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DetailPrint "Removing aidev:// protocol handler..."
    DeleteRegKey HKCU "Software\Classes\aidev"
    DeleteRegKey HKCR "aidev"

    DetailPrint "Removing Aidev CLI from PATH..."
    nsExec::Exec 'powershell -NoProfile -WindowStyle Hidden -Command "$$p = [Environment]::GetEnvironmentVariable(\"Path\", \"User\"); if ($$p) { $$n = ($$p -split \";\" | Where-Object { $$_ -ne \"$INSTDIR\" -and $$_ -ne \"\" }) -join \";\"; [Environment]::SetEnvironmentVariable(\"Path\", $$n, \"User\") }"'

    MessageBox MB_YESNO "Apakah Anda ingin menghapus seluruh data pengaturan, riwayat chat, dan cache (~/.aidev) agar bersih total dari PC ini?" /SD IDNO IDNO SkipDelete
    RMDir /r "$PROFILE\.aidev"
    RMDir /r "$PROFILE\.cache\aidev-runtimes"
    RMDir /r "$APPDATA\Aidev Desktop"
    RMDir /r "$LOCALAPPDATA\aidev-desktop-updater"
  SkipDelete:
  ${endIf}
!macroend
