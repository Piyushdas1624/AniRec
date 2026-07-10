@echo off
echo Starting AniRec AI Application...
echo.

echo Installing Backend Dependencies...
cd backend
call npm install
cd ..

echo.
echo Installing Frontend Dependencies...
cd frontend
call npm install
cd ..

echo.
echo Starting Backend Server...
start "AniRec Backend" cmd /k "cd backend && npm run dev"

echo.
echo Starting Frontend Server...
start "AniRec Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both servers have been started in new windows.
echo You can close this window now.
pause
