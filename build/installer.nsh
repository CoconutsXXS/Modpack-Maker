!include "nsProcess.nsh"

!macro customCheckAppRunning
  ; override and skip built-in dialog
!macroend

!macro customInit
  DetailPrint "Attempting to close ${PRODUCT_FILENAME}.exe..."
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  ${If} $R0 != 0
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 1000
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 500
  ${EndIf}
  ${nsProcess::Unload}
!macroend
