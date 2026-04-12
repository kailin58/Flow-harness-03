/**
 * 浏览器使用习惯完整测试
 * - 自动检测浏览器
 * - 使用习惯记录
 * - 自动切换
 * - 下载建议
 */

const { BrowserDetector, BROWSER_CONFIG } = require('./src/browser-detector');
const { BrowserUsageTracker } = require('./src/browser-usage-tracker');

async function testFullFlow() {
  console.log('=== 浏览器使用习惯完整测试 ===\n');

  const detector = new BrowserDetector();
  const tracker = new BrowserUsageTracker();

  // 1. 检测浏览器
  console.log('1. 检测本机浏览器...');
  await detector.detectBrowsers();
  const config = await detector.loadConfig();

  // 2. 显示检测报告
  console.log('\n' + detector.getStatusReport());

  // 3. 模拟使用习惯推荐
  console.log('2. 基于使用习惯的推荐...');
  const usageRec = await detector.getUsageBasedRecommendation();
  console.log(`   推荐: ${usageRec.browserId || '无'}`);
  console.log(`   原因: ${usageRec.reason}`);
  console.log('\n' + usageRec.usageReport);

  // 4. 模拟浏览器失败自动切换
  console.log('\n3. 模拟浏览器失败自动切换...');
  const installed = detector.detectedBrowsers.filter(b => b.installed);

  if (installed.length > 1) {
    const currentBrowser = installed[0];
    console.log(`   当前浏览器: ${currentBrowser.nameCN}`);

    const switchResult = detector.switchToNextBrowser(currentBrowser.id);
    if (switchResult.success) {
      console.log(`   自动切换到: ${switchResult.browser.nameCN}`);
      console.log(`   消息: ${switchResult.message}`);
    } else {
      console.log(`   切换失败: ${switchResult.message}`);
    }
  } else {
    console.log('   只有一个浏览器，无法切换');
  }

  // 5. 模拟下载建议
  console.log('\n4. 下载建议测试...');
  const downloadSuggestion = detector.getDownloadSuggestion();
  console.log(`   ${downloadSuggestion.message}`);
  downloadSuggestion.browsers.forEach((b, i) => {
    console.log(`   ${i + 1}. ${b.name} - ${b.downloadUrl}`);
  });

  // 6. 记录使用数据
  console.log('\n5. 记录使用数据...');
  const testBrowser = installed[0];
  if (testBrowser) {
    await tracker.recordUsage(testBrowser, {
      duration: 120,
      pagesVisited: 5,
      hadLogin: true,
      sites: ['taobao.com', 'jd.com']
    });
    console.log(`   已记录 ${testBrowser.nameCN} 的使用数据`);
  }

  // 7. 显示最终使用报告
  console.log('\n6. 最终使用报告:');
  console.log(tracker.getUsageReport());
}

testFullFlow().catch(console.error);
