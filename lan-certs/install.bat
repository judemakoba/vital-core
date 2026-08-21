@echo off
REM install.bat - Windows launcher for install.ps1
REM
REM Just double-click this file. If it does not trigger the UAC
REM elevation prompt automatically, right-click it and choose
REM "Run as administrator".

setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
endlocal
