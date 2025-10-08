!macro customInit
  ; This macro runs before installation starts
  ; Try to close the app silently if it's running
  nsExec::ExecToStack 'taskkill /IM "ModpackMaker.exe" /F'
!macroend