@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo 開始部署到 Vercel
echo ========================================
echo.

echo [1/3] 添加修改的文件...
git add .
if %errorlevel% neq 0 (
    echo 錯誤：無法添加文件
    pause
    exit /b 1
)
echo ✓ 文件已添加
echo.

echo [2/3] 提交變更...
git commit -m "修復完整版"
if %errorlevel% neq 0 (
    echo 注意：可能沒有新的變更需要提交
)
echo ✓ 變更已提交
echo.

echo [3/3] 推送到 Git 並觸發 Vercel 自動部署...
git push
if %errorlevel% neq 0 (
    echo 錯誤：推送失敗
    pause
    exit /b 1
)
echo ✓ 已推送到 Git
echo.

echo ========================================
echo 部署完成！
echo Vercel 會自動偵測到變更並開始部署
echo 請到 Vercel 控制台查看部署狀態
echo ========================================
echo.
pause

