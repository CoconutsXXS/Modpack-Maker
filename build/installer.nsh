; build/installer.nsh
!include "nsProcess.nsh"

!macro preInit
  ; Si la macro CHECK_APP_RUNNING a été définie par le template, on la supprime proprement
  !ifdef CHECK_APP_RUNNING
    !undef CHECK_APP_RUNNING
  !endif

  ; Indication supplémentaire (selon version) pour tenter de sauter le check interne
  !define SKIP_APP_RUNNING_CHECK
!macroend

; Neutralise le check par défaut (ne rien afficher)
!macro customCheckAppRunning
  ; intentionally empty to avoid the default popup
!macroend

; Tentative de fermeture tôt dans le flow d'installation
!macro customInit
  DetailPrint "customInit: tentative de fermeture ${PRODUCT_FILENAME}.exe"
  DetailPrint ">>> Avant FindProcess"
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  DetailPrint ">>> Après FindProcess (R0=$R0)"
  ${If} $R0 != 0
    DetailPrint "Process ${PRODUCT_FILENAME}.exe trouvé (PID = $R0) — fermeture..."
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 2000
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 800
    DetailPrint "Tentative de fermeture terminée."
  ${Else}
    DetailPrint "${PRODUCT_FILENAME}.exe non trouvé — OK."
  ${EndIf}
  ${nsProcess::Unload}
!macroend

; File copy / install phase : dernière vérif avant écriture des fichiers
!macro customInstall
  DetailPrint "customInstall: vérification finale de ${PRODUCT_FILENAME}.exe"
  ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
  ${If} $R0 != 0
    DetailPrint "Process encore trouvé (PID=$R0) — tentative finale..."
    ${nsProcess::CloseProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 1500
    ${nsProcess::KillProcess} "${PRODUCT_FILENAME}.exe" $R0
    Sleep 500
  ${EndIf}
  ${nsProcess::Unload}
!macroend
