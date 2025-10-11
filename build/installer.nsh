; include du plugin nsProcess
!include "nsProcess.nsh"

; Option: définir un macro `preInit` pour neutraliser le check interne
!macro preInit
  ; Tentative de désactiver le check interne
  !undefine CHECK_APP_RUNNING
  !define SKIP_APP_RUNNING_CHECK
!macroend

; Override du check par défaut — vide
!macro customCheckAppRunning
  ; On désactive le dialogue par défaut
!macroend

; Fermer l'app dès le début
!macro customInit
  DetailPrint "customInit: tenter de fermer ${PRODUCT_FILENAME}.exe"
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  ${If} $R0 != 0
    DetailPrint "Process ${PRODUCT_FILENAME}.exe trouvé (PID = $R0), fermeture..."
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 1500
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 500
  ${Else}
    DetailPrint "${PRODUCT_FILENAME}.exe non trouvé — pas besoin de le fermer."
  ${EndIf}
  ${nsProcess::Unload}
!macroend

; Optionnel : dernière tentative juste avant installation
!macro customInstall
  DetailPrint "customInstall: vérification finale fermeture ${PRODUCT_FILENAME}.exe"
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  ${If} $R0 != 0
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 1000
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 300
  ${EndIf}
  ${nsProcess::Unload}
!macroend
