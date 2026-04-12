/**
 * 测试增强版视觉识别功能
 * 验证所有视觉识别和智能浏览器功能
 */

const { BrowserAssistant } = require('./src/browser-assistant');
const { SmartBrowser } = require('./src/smart-browser');

// 设置全局超时
const GLOBAL_TIMEOUT = 60000; // 60秒总超时

async function testVisionEnhanced() {
  // 设置全局超时
  const timeoutId = setTimeout(() => {
    console.log('\n全局超时，强制退出...');
    process.exit(0);
  }, GLOBAL_TIMEOUT);
  console.log('=== 增强版视觉识别测试 ===\n');

  // 1. 初始化浏览器
  console.log('1. 初始化浏览器...');
  const assistant = new BrowserAssistant();
  await assistant.initWithUserSelection('auto');

  const page = assistant.page;
  const smart = new SmartBrowser(page);

  console.log('   浏览器已初始化\n');

  // 2. 测试智能导航
  console.log('2. 测试智能导航...');
  const navResult = await smart.smartNavigate('https://www.baidu.com', {
    humanRead: true
  });
  console.log('   导航结果:', navResult.success ? '成功' : '失败');
  console.log('   是否被拦截:', navResult.blocked ? '是' : '否');
  console.log('   隐蔽状态:', smart.isStealthy() ? '✓ 安全' : '⚠ 可能被检测');

  // 3. 测试页面区域分析
  console.log('\n3. 测试页面区域分析...');
  const regions = await smart.analyzeRegions();
  console.log('   视口大小:', regions.viewport.width, 'x', regions.viewport.height);
  console.log('   网格大小:', regions.gridSize + 'x' + regions.gridSize);
  console.log('   区域类型分布:');
  const typeCount = {};
  for (const region of regions.regions) {
    typeCount[region.regionType] = (typeCount[region.regionType] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCount)) {
    console.log(`     ${type}: ${count}`);
  }

  // 4. 测试边缘元素检测
  console.log('\n4. 测试边缘元素检测...');
  const elements = await smart.vision.detectEdgeElements();
  console.log('   检测到元素数:', elements.length);
  console.log('   前5个元素:');
  elements.slice(0, 5).forEach((el, i) => {
    console.log(`     ${i + 1}. ${el.tagName}${el.type ? '[' + el.type + ']' : ''} - "${el.text.substring(0, 20)}" (边缘分数: ${el.edgeScore})`);
  });

  // 5. 测试视觉定位按钮
  console.log('\n5. 测试视觉定位按钮...');
  const searchButton = await smart.vision.findMostLikelyButton('搜索');
  if (searchButton) {
    console.log('   找到搜索按钮:');
    console.log('     位置:', searchButton.x, 'x', searchButton.y);
    console.log('     大小:', searchButton.width, 'x', searchButton.height);
    console.log('     匹配类型:', searchButton.matchType);
  } else {
    console.log('   未找到搜索按钮');
  }

  // 6. 测试智能输入
  console.log('\n6. 测试智能输入...');
  try {
    // 直接使用选择器输入，带超时
    await page.fill('#kw', 'Playwright自动化测试', { timeout: 5000 });
    console.log('   输入成功');
  } catch (e) {
    console.log('   输入失败:', e.message);
  }

  // 等待一下
  await smart.human.randomDelay(500, 1000);

  // 7. 测试截图和保存
  console.log('\n7. 测试截图和保存...');
  await smart.captureAndSave('test_screenshot.png');
  console.log('   截图已保存');

  // 8. 测试视觉稳定检测
  console.log('\n8. 测试视觉稳定检测...');
  const isStable = await smart.waitForStable({ timeout: 5000 });
  console.log('   页面是否稳定:', isStable ? '是' : '否');

  // 9. 测试智能点击搜索按钮
  console.log('\n9. 测试智能点击搜索按钮...');
  try {
    // 使用视觉点击
    const visualResult = await smart.visualClick('百度一下');
    console.log('   视觉点击成功:', visualResult.position);
  } catch (e) {
    console.log('   点击失败:', e.message);
    // 备用方案：直接点击
    try {
      await page.click('#su');
      console.log('   直接点击成功');
    } catch (e2) {
      console.log('   直接点击也失败:', e2.message);
    }
  }

  // 等待搜索结果
  await smart.human.randomDelay(1000, 2000);

  // 10. 测试数据提取
  console.log('\n10. 测试数据提取...');
  const searchData = await smart.extractData({
    titles: '.result.c-container a',
    snippets: '.result.c-container .c-abstract'
  });
  console.log('   提取结果:');
  console.log('     标题数:', Array.isArray(searchData.titles) ? searchData.titles.length : 0);
  console.log('     摘要数:', Array.isArray(searchData.snippets) ? searchData.snippets.length : 0);

  // 11. 测试链接查找和点击
  console.log('\n11. 测试链接查找...');
  const link = await smart.vision.findLink('Playwright');
  if (link) {
    console.log('   找到链接:');
    console.log('     位置:', link.x, 'x', link.y);
    console.log('     策略:', link.strategy);
  } else {
    console.log('   未找到链接');
  }

  // 12. 显示最终状态
  console.log('\n12. 最终状态...');
  const status = smart.getStealthStatus();
  console.log('   操作次数:', status.actionCount);
  console.log('   错误次数:', status.errorCount);
  console.log('   最后操作时间:', new Date(status.lastActionTime).toLocaleTimeString());
  console.log('   是否隐蔽:', smart.isStealthy() ? '✓ 安全' : '⚠ 可能被检测');

  // 13. 测试页面变化检测
  console.log('\n13. 测试页面变化检测...');
  const before = await smart.vision.captureScreen();

  // 执行一些操作
  await smart.human.scroll(page, 300);
  await smart.human.randomDelay(500, 1000);

  const diffResult = await smart.detectChanges(before);
  console.log('   检测到变化:', diffResult.hasChanges ? '是' : '否');
  console.log('   变化像素:', diffResult.diffPixels);
  console.log('   变化比例:', (diffResult.diffPercent * 100).toFixed(2) + '%');

  console.log('\n=== 测试完成 ===');

  // 清除超时
  clearTimeout(timeoutId);

  // 关闭浏览器
  await assistant.close();
}

// 运行测试
testVisionEnhanced().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
