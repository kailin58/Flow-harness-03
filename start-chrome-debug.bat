@echo off
echo ========================================
echo   启动 Chrome（远程调试模式）
echo ========================================
echo.
echo 端口: 9222
echo 用途: 允许 Flow Harness 连接并使用已保存的登录状态
echo.
echo 启动后请在 Chrome 中登录需要访问的网站
echo 然后运行 test-local-chrome.js 测试
echo.
echo ========================================
echo.

"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --no-first-run

pause
