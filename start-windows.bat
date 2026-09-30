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
  echo Note: no Claude API key in config.txt, so the SNAP assistant uses a basic keyword check.
  echo The rest of the site works. To turn the AI on, add your key to config.txt and run this again.
  echo.
)
start "" http://localhost:3000
node server.js
pause
