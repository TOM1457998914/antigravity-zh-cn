@echo off
setlocal DisableDelayedExpansion

set "PATCH_NODE="
for %%I in (node.exe) do set "PATCH_NODE=%%~$PATH:I"
call :check_node
if not errorlevel 1 goto apply_patch

if not defined LOCALAPPDATA goto missing_node
set "PATCH_NODE=%LOCALAPPDATA%\Antigravity-Localization\node\node.exe"
call :check_node
if errorlevel 1 goto missing_node

:apply_patch
"%PATCH_NODE%" "%~dp0localize.mjs" apply %*
set "PATCH_RESULT=%ERRORLEVEL%"
goto finish

:missing_node
echo Node.js 20 or later is required. Install it from https://nodejs.org/ 1>&2
echo Or place a portable node.exe under %%LOCALAPPDATA%%\Antigravity-Localization\node\. 1>&2
set "PATCH_RESULT=1"

:finish
if "%~1"=="" pause
exit /b %PATCH_RESULT%

:check_node
if not defined PATCH_NODE exit /b 1
if not exist "%PATCH_NODE%" exit /b 1
"%PATCH_NODE%" -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)" >nul 2>&1
exit /b %ERRORLEVEL%
