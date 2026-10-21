@echo off
setlocal
set "probe_vs="
for /f "usebackq tokens=*" %%i in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "probe_vs=%%i"
if not defined probe_vs exit /b 1
call "%probe_vs%\Common7\Tools\VsDevCmd.bat" -no_logo -arch=x64 -host_arch=x64 -vcvars_ver=14.51.36231 -winsdk=10.0.26100.0
if errorlevel 1 exit /b 1
if not "%WindowsSDKVersion%"=="10.0.26100.0\" exit /b 1
if not "%VCToolsVersion%"=="14.51.36231" exit /b 1
echo Native SDK: %WindowsSDKVersion%
echo Native compiler tools: %VCToolsVersion%
set "probe_out=%~dp0..\..\dist\native-probe"
if not exist "%probe_out%" mkdir "%probe_out%"
pushd "%probe_out%"
cl /nologo /std:c++20 /EHsc /W4 /WX /MD /utf-8 /external:anglebrackets /external:W0 "%~dp0main.cpp" /Fe:capture-probe.exe /Fo:probe.obj /link windowsapp.lib user32.lib dwmapi.lib d3d11.lib gdi32.lib /DYNAMICBASE /NXCOMPAT
if errorlevel 1 exit /b 1
dumpbin /dependents capture-probe.exe
if errorlevel 1 exit /b 1
for /l %%i in (1,1,3) do (
  capture-probe.exe --self-test
  if errorlevel 1 exit /b 1
  capture-probe.exe --selection-self-test
  if errorlevel 1 exit /b 1
)
capture-probe.exe --selection-self-test --extra
if not "%errorlevel%"=="2" exit /b 1
capture-probe.exe --external-target
if not "%errorlevel%"=="2" exit /b 1
capture-probe.exe
if not "%errorlevel%"=="2" exit /b 1
echo PASS unsupported arguments rejected
popd
exit /b 0
