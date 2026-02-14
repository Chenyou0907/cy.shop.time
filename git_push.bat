@echo off
chcp 65001 >nul
echo 正在添加修改的文件...
git add .
echo.
echo 正在提交...
git commit -m "新增功能：點擊歷史記錄可直接編輯該日期的工時資料"
echo.
echo 正在推送到遠端...
git push
echo.
echo 完成！
pause

