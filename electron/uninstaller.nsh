; HomeStream custom uninstaller script
; Injected by electron-builder via customNsisBinary / include hook.
;
; Shows a "Delete my library and settings?" checkbox on the uninstall
; confirmation page.  Checked = wipe %APPDATA%\HomeStream after removal.
; Unchecked (default) = keep all user data so a reinstall picks it up.

!macro customUnInstall
  ; ── Ask the user whether to delete their data ──────────────────────────────
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to delete your HomeStream library, settings, and profiles?$\n$\nClick YES to remove everything.$\nClick NO to keep your data (useful if you plan to reinstall)." \
    IDNO hs_keep_data

  ; User chose YES — delete %APPDATA%\HomeStream
  RMDir /r "$APPDATA\HomeStream"

  hs_keep_data:
!macroend
