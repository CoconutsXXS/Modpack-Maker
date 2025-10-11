!include "nsProcess.nsh"

!macro customCheckAppRunning
  DetailPrint "Checking if ${PRODUCT_FILENAME}.exe is running..."
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  ${If} $R0 != 0
    DetailPrint "Installer: closing running app ${PRODUCT_FILENAME}.exe"
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 1000
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 500
  ${Else}
    DetailPrint "${PRODUCT_FILENAME}.exe is not running."
  ${EndIf}
  ${nsProcess::Unload}
!macroend