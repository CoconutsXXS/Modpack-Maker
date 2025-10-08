!macro customCheckAppRunning
  ; override default check — skip “cannot be closed” dialog
!macroend

!macro customInit
  ; attempt graceful close, wait, then force kill
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 != 0
    DetailPrint "Installer: closing running app ${APP_EXECUTABLE_FILENAME}"
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1000
    ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 500
  ${EndIf}
  ${nsProcess::Unload}
!macroend