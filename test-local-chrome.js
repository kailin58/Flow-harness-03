/**
 * 测试连接本地 Chrome
 *
 * 使用方法：
 * 1. 先用远程调试模式启动 Chrome：
 *    "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
 *
 * 2. 在 Chrome 中登录淘宝、京东等网站
 *
 * 3. 运行此测试脚本
 */

const { BrowserAssistant } = require('./src/browser-assistant');

async function test() {
  console.log('=== 连接本地 Chrome 测试 ===\n');

  const assistant = new BrowserAssistant();

  console.log('1. 初始化浏览器...');
  await assistant.init();

  console.log('\n2. 连接状态:');
  console.log('   已连接:', assistant.isConnected());
  console.log('   使用本地 Chrome:', assistant.connectedToLocalChrome);

  console.log('\n3. 访问淘宝...');
  const result = await assistant.visit('https://www.taobao.com');

  console.log('   成功:', result.success);
  console.log('   需要登录:', result.needLogin || false);

  if (result.success) {
    console.log('   标题:', result.title);
    console.log('\n✓ 使用本地 Chrome 的登录状态，无需重新登录！');
  } else if (result.needLogin) {
    console.log('\n请在浏览器窗口中登录，登录后运行 test-confirm.js 确认');
  }

  console.log('\n浏览器窗口保持打开，按 Ctrl+C 退出');
}

test().catch(console.error);
