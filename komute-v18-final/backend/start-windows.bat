@echo off
cd /d "%~dp0"
if not exist ".env" if exist ".env.txt" ren ".env.txt" ".env"
if not exist ".env" (
  echo No .env file in %CD%
  echo Copying .env.example to .env ...
  copy ".env.example" ".env" >nul
)
findstr /r /c:"^GEMINI_API_KEY=..*" ".env" >nul
if errorlevel 1 (
  echo.
  echo Your Gemini key is missing. Notepad will open backend\.env
  echo Paste your key right after GEMINI_API_KEY=  then Save and close Notepad.
  notepad ".env"
)
node server.mjs
pause
