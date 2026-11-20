@echo off
chcp 65001 >nul
echo 루시페린 워크 설치 파일을 만듭니다. (처음 한 번 5~10분)
where node >nul 2>nul || (echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 를 설치한 뒤 다시 실행해 주십시오. & pause & exit /b 1)
call npm install || (echo 설치 중 문제가 생겼습니다. & pause & exit /b 1)
call npm run dist || (echo 만들기 중 문제가 생겼습니다. & pause & exit /b 1)
echo.
echo 다 만들었습니다. dist 폴더의 LuciferinWork-Setup-1.0.0.exe 와 latest.yml 을 확인해 주십시오.
explorer dist
pause
