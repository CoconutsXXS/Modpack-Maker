!include "nsProcess.nsh"

!macro preInit
  ; Utiliser la directive correcte pour annuler une définition
  !undef CHECK_APP_RUNNING
  !define SKIP_APP_RUNNING_CHECK
!macroend

!macro customCheckAppRunning
  ; vide pour neutraliser le check interne + popup
!macroend

!macro customInit
  DetailPrint "customInit: tentative de fermeture ${PRODUCT_FILENAME}.exe"
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  ${If} $R0 != 0
    DetailPrint "Process ${PRODUCT_FILENAME}.exe trouvé (PID = $R0), fermeture en cours..."
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 1500
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 500
  ${Else}
    DetailPrint "${PRODUCT_FILENAME}.exe non trouvé."
  ${EndIf}
  ${nsProcess::Unload}
!macroend

!macro customInstall
  DetailPrint "customInstall: tentative finale de fermeture ${PRODUCT_FILENAME}.exe"
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  ${If} $R0 != 0
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 1000
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 300
  ${EndIf}
  ${nsProcess::Unload}
!macroend
