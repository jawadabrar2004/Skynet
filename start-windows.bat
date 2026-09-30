@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org then run this again.
  pause
  exit /b
)
if not exist config.txt copy config.example.txt config.txt >nul
findstr /R /C:"^ANTHROPIC_API_KEY=sk-" config.txt >nul 2>nul
if errorlevel 1 (
  echo Your API key is not in config.txt yet.
  echo Notepad will open. Paste your key after ANTHROPIC_API_KEY= , save, close Notepad, then run this again.
  notepad config.txt
  pause
  exit /b
)
start "" http://localhost:3000
node server.js
pause
