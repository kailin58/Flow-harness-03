/**
 * 浏览器检测测试
 */

const { BrowserDetector } = require('./src/browser-detector');

async function test() {
  console.log('=== 浏览器检测测试 ===\n');

  const detector = new BrowserDetector();

  // 检测浏览器
  console.log('1. 检测本机浏览器...');
  const browsers = await detector.detectBrowsers();

  // 加载配置
  console.log('\n2. 加载用户配置...');
  const config = await detector.loadConfig();
  console.log('当前优先级:', config.priority);

  // 输出报告
  console.log('\n' + detector.getStatusReport());

  // 选择最佳浏览器
  console.log('3. 选择最佳浏览器...');
  const best = await detector.selectBestBrowser();

  if (best) {
    console.log(`\n推荐: ${best.name}`);
    console.log(`原因: ${best.reason}`);
    console.log(`路径: ${best.path}`);
    console.log(`调试端口: ${best.debugPort}`);
    console.log(`调试已启用: ${best.debugEnabled}`);
  } else {
    console.log('未找到可用浏览器');
  }

  // 演示修改优先级
  console.log('\n4. 修改优先级演示...');
  console.log('将 Edge 设为第一优先级');

  await detector.saveConfig({
    priority: ['edge', 'chrome', 'brave', 'opera', 'firefox']
  });

  const newBest = await detector.selectBestBrowser();
  if (newBest) {
    console.log(`新的推荐: ${newBest.name}`);
  }
}

test().catch(console.error);
